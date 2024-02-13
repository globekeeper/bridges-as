import { BridgeConfigProvisioning } from "../config/Config";
import { Router, default as express, NextFunction, Request, Response } from "express";
import { Logger } from "matrix-appservice-bridge";
import { GetConnectionsResponse, MqttConnection } from "./api";
import { ApiError, ErrCode } from "../api";
import { MatrixClient } from "matrix-bot-sdk";
import Metrics from "../Metrics";
import { BridgeConfigMqtt } from "../config/Config";
import BotUsersManager from "../Managers/BotUsersManager";
import cors from "cors";
import { Pool } from "pg";
import { SelectSpaceConnectionsArgs, selectSpaceConnections, selectConnection, insertConnection, updateConnectionAssociatedSpaces, deleteSpaceFromConnectionAndPrune } from "../db/generated/queries_sql";
import axios from "axios";

const log = new Logger("MqttConnectionsManager");

// Simple validator
const ROOM_ID_VALIDATOR = /!.+:.+/;

export class MqttConnectionsManager {
    public readonly expressRouter: Router = Router();
    constructor(
        private readonly dbCli: Pool,
        private readonly mqtt: BridgeConfigMqtt,
        private readonly botUsersManager: BotUsersManager) {
        this.expressRouter.use("/mqtt", (req, _res, next) => {
            Metrics.mqttHttpRequest.inc({path: req.path, method: req.method});
            next();
        });
        const corsOptions: cors.CorsOptions = {
            origin: '*',
            credentials: true,
            methods: ['GET', 'POST', 'DELETE', 'PUT'],
            allowedHeaders: [
                'Origin',
                'X-Requested-With',
                'Content-Type',
                'Accept',
                'Authorization',
            ],
            maxAge: 86400, // 24 hours
        };
        this.expressRouter.use(cors(corsOptions));
        this.expressRouter.get("/mqtt/health", this.getHealth);
        this.expressRouter.use("/mqtt", this.checkAuth.bind(this));
        this.expressRouter.use(express.json());
        this.expressRouter.get<{ mqttConnection: MqttConnection }>(
            "/mqtt/connections",
            this.checkSpaceId.bind(this),
            this.getConnections.bind(this),
        );
        this.expressRouter.post<{ mqttConnection: MqttConnection }>(
            "/mqtt/connection",
            this.checkSpaceId.bind(this),
            this.postConnection.bind(this),
        );
        this.expressRouter.delete<{ mqttConnection: MqttConnection }>(
            "/mqtt/connection",
            this.checkSpaceId.bind(this),
            this.deleteConnection.bind(this),
        );
    }

    // Authenticate and make sure the user is an admin+
    private checkAuth(req: Request, _res: Response, next: NextFunction) {
        let token;
        try {
            token = extractToken(req.headers.authorization);
        } catch (error) {
            throw new ApiError(error.message, ErrCode.BadToken);
        }
        const spaceId = req.query.space_id;
        const cli = new MatrixClient(this.botUsersManager.config.bridge.url, token);
        cli.getWhoAmI().then((whoami) => {
            cli.getRoomStateEvent(spaceId, "m.room.power_levels", "").then((event) => {
                if (!event) {
                    throw new Error(`No power level event found for space: ${spaceId}`);
                }
                if (event["users"]?.[whoami.user_id] < 90) {
                    throw new ApiError("Unauthorized", ErrCode.BadToken);
                }
                next();
            });
        }).catch((error) => {
            _res.status(401).send({ error: error.message });
        });
    }
    
    private checkSpaceId(req: Request<{ mqttConnection?: MqttConnection }>, _res: Response, next: NextFunction) {
        if (typeof req.query.space_id !== "string" || !ROOM_ID_VALIDATOR.exec(req.query.space_id)) {
            throw new ApiError("Invalid spaceId", ErrCode.BadValue);
        }
        if (req.query.space_id == "") {
            throw new ApiError("space_id must be provided", ErrCode.BadValue);
        }
        next();
    }

    private getHealth(_req: Request, res: Response) {
        return res.send({})
    }

    private async getConnections(req: Request<{ mqttConnection: MqttConnection }>, res: Response<GetConnectionsResponse | { error: string }>) {
        const spaceId = req.query.space_id as string;
        try {
            const args: SelectSpaceConnectionsArgs = {
                spaceIds: [spaceId]
            };

            const connections = await selectSpaceConnections(this.dbCli, args);
            if (connections.length === 0) {
                return res.status(200).send();
            }

            const payloadResp: { mqttClients: MqttConnection[] } = { mqttClients: [] };
            for (const conn of connections) {
                const obfuscatedConn: MqttConnection = {
                    broker: conn.broker,
                    clientId: conn.clientId,
                    username: conn.username,
                };
                payloadResp.mqttClients.push(obfuscatedConn);
            }
            return res.status(200).send(payloadResp);
        } catch (err) {
            log.error(`getConnections: An error occurred: ${err}`);
            return res.status(500).send({ error: `connections: unable to fetch connections for space: ${spaceId}`} );
        }
    }

    private async postConnection(req: Request<{ mqttConnection: MqttConnection }>, res: Response<{ ok: true } | { error: string }>) {
        const spaceId = req.query.space_id as string;
        if (!req.body.mqttConnection ||
            !req.body.mqttConnection.broker||
            !req.body.mqttConnection.username || 
            !req.body.mqttConnection.clientId || 
            !req.body.mqttConnection.password) {
            return res.status(400).send({ error: 'missing values in request payload' });
        }
        const broker = req.body.mqttConnection.broker;
        const username = req.body.mqttConnection.username;
        const clientId = req.body.mqttConnection.clientId;
        const password = req.body.mqttConnection.password;
        try {
            const connection = await selectConnection(this.dbCli, {
                broker: broker,
                username: username,
            });
            if (!connection) {
                // If it doesn't exists, push the change to MQTTAS to initiate connection with the broker and create a new live connection
                const { data, status } = await axios.post(`${this.mqtt.mqttasAddress}/connection?space_id=${spaceId}`,
                    {
                        connection: {
                            broker,
                            username,
                            client_id: clientId,
                            password,
                        }
                    },
                    {
                        headers: {
                            'Content-Type': 'application/json',
                        },
                });
                if (status !== 200) {
                    log.error(`postConnection: failed to initialize connection ${username}@${broker} with error: ${data.error}`);
                    return res.status(404).send({ error: 'failed to connect to broker with provided credentials' });
                }
                await insertConnection(this.dbCli, {
                    spaceIds: [spaceId],
                    broker: broker,
                    username: username,
                    clientId: clientId,
                    password: password,
                });
                log.info(`postConnection: successfully initialized connection ${username}@${broker}`);
                return res.status(200).send({ ok: true });
            } else {
                if (connection.spaceIds.includes(spaceId)) {
                    // If the connection exists, and spaces array contains it, no-op
                    return res.status(200).send({ ok: true });
                } else {
                    const updatedSpaceIds = [...connection.spaceIds, spaceId];
                    // If the connection exists, PUT connection spaceIds array on MQTTAS to update the live connections spaceIds array
                    const { data, status } = await axios.put(`${this.mqtt.mqttasAddress}/connection?space_id=${spaceId}`, 
                        { 
                            connection: {
                                broker,
                                username 
                            },
                        },
                        { headers: {'Content-Type': 'application/json'}
                    });
                    if (status !== 200) {
                        log.error(`postConnection: failed to updated associated spaces for connection ${username}@${broker} with error: ${data.error}`);
                        return res.status(404).send({ error: 'failed to connect to broker with provided credentials' });
                    }
                    await updateConnectionAssociatedSpaces(this.dbCli, {
                        spaceIds: updatedSpaceIds,
                        broker: broker,
                        username: username,
                    });
                    log.info(`postConnection: spaces associated to connection ${username}@${broker} successfully updated`);
                    return res.status(200).send({ ok: true });
                }
            }
        } catch (err) {
            if (axios.isAxiosError(err) && err.response) {
                log.error(`postConnection: failed to initialize connection ${username}@${broker} with error: ${err.message}`);
                return res.status(err.response.status).send({ error: err.message });
            }
            log.error(`postConnection: failed to initialize connection ${username}@${broker} with error: ${err}`);
            return res.status(500).send({ error: 'An error occurred' });
        }
    }

    private async deleteConnection(req: Request<{ mqttConnection: MqttConnection }>, res: Response<{ ok: true } | { error: string }>) {
        const spaceId = req.query.space_id as string;
        const username = req.query.username as string;
        const broker = req.query.broker as string;
        try {
            if (!username || !broker) {
                return res.status(400).send({ error: 'mqtt username and broker must be provided' });
            }
            const connection = await selectConnection(this.dbCli, {
                broker: broker,
                username: username,
            });
            if (!connection) {
                log.error(`deleteConnection: connection ${username}@${broker} not found`);
                return res.status(404).send({ error: `connection ${username}@${broker} not found` });
            }
            if (!connection.spaceIds.includes(spaceId)) {
                log.error(`deleteConnection: connection ${username}@${broker} not associated with space ${spaceId}`);
                return res.status(404).send({ error: `connection ${username}@${broker} not associated with space ${spaceId}` });
            }
            const { data, status } = await axios.delete(`${this.mqtt.mqttasAddress}/connection?space_id=${spaceId}&username=${username}&broker=${broker}`,
                { headers: { 'Content-Type': 'application/json' }
            });
            if (status !== 200) {
                log.error(`deleteConnection: failed to delete connection ${username}@${broker} with error: ${data.error}`);
                return res.status(404).send({ error: `failed to delete connection ${username}@${broker}` });
            }
            await deleteSpaceFromConnectionAndPrune(this.dbCli, {
                arrayRemove: spaceId,
                broker: broker,
                username: username,
            });
            return res.status(200).send({ ok: true });
        } catch (err) {
            if (axios.isAxiosError(err) && err.response) {
                log.error(`deleteConnection: failed to delete connection ${username}@${broker} with error: ${err.message}`);
                return res.status(err.response.status).send({ error: err.message });
            }
            log.error(`deleteConnection: failed to delete connection ${username}@${broker} with error: ${err}`);
            return res.status(500).send({ error: 'An error occurred' });
        }
    }
}

function extractToken(authHeader: string | undefined): string {
    if (!authHeader) {
        throw new Error('No Authorization Header');
    }
    const parts = authHeader.split(' ');
    if (parts.length != 2 || parts[0] != 'Bearer') {
        throw new Error('Invalid Authorization Header');
    }
    return parts[1];
}
