import { Logger } from "matrix-appservice-bridge";
import { BridgeConfigMqtt } from "../config/Config";
import { Pool } from "pg";
import { SelectSpaceConnectionsArgs, selectSpaceConnections, selectConnection, insertConnection, updateConnectionAssociatedSpaces, deleteSpaceFromConnectionAndPrune, selectAllConnections } from "../db/generated/queries_sql";
import axios from "axios";
import "dotenv/config";
import { MqttConnectionState } from "../Connections/MqttConnection";
import * as fs from 'fs';

const log = new Logger("MqttConnectionsManager");

function executeSchema(dbCli: Pool) {
    try {
        const schemaSql = fs.readFileSync('./src/db/schema.sql', 'utf8');
        dbCli.query(schemaSql);
        log.info('MQTT table created successfully');
    } catch (err) {
        log.info('Error creating MQTT table: ', err);
    }
}

export class MqttConnectionsManager {
    private dbCli: Pool;

    constructor() {
        this.dbCli = new Pool({ connectionString: process.env.DATABASE_URL });
        executeSchema(this.dbCli);
    }
    
    public async createMqttConnection(config: BridgeConfigMqtt, mqttConnection: MqttConnectionState, accessToken: string, spaceId: string) {
        const broker = mqttConnection.broker;
        const username = mqttConnection.username;
        const clientId = mqttConnection.clientId;
        const password = mqttConnection.password as string;
        try {
            const connection = await selectConnection(this.dbCli, {
                broker: broker,
                username: username,
            });
            if (!connection || connection.spaceIds.length === 0) {
                // If it doesn't exists, push the change to MQTTAS to initiate connection with the broker and create a new live connection
                const { data, status } = await axios.post(`${config.mqttasAddress}/connection?space_id=${spaceId}`,
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
                            Authorization: `Bearer ${accessToken}`
                        },
                });
                if (status !== 200) {
                    log.error(`postConnection: failed to initialize connection ${username}@${broker} with error: ${data.error}`);
                    return { status: 404, error: 'failed to connect to broker with provided credentials' };
                }
                await insertConnection(this.dbCli, {
                    spaceIds: [spaceId],
                    broker: broker,
                    username: username,
                    clientId: clientId,
                    password: password,
                });
                log.info(`postConnection: successfully initialized connection ${username}@${broker}`);
                return { status: 200, ok: true };
            } else {
                if (connection.spaceIds.includes(spaceId)) {
                    // If the connection exists, and spaces array contains it, no-op
                    return { status: 200, ok: true };
                } else {
                    const updatedSpaceIds = [...connection.spaceIds, spaceId];
                    // If the connection exists, PUT connection spaceIds array on MQTTAS to update the live connections spaceIds array
                    const { data, status } = await axios.put(`${config.mqttasAddress}/connection?space_id=${spaceId}`, 
                        { 
                            connection: {
                                broker,
                                username 
                            },
                        },
                        { 
                            headers: {
                                'Content-Type': 'application/json',
                                Authorization: `Bearer ${accessToken}`
                            },
                    });
                    if (status !== 200) {
                        log.error(`postConnection: failed to update associated spaces for connection ${username}@${broker} with error: ${data.error}`);
                        return { status: 404, error: 'failed to connect to broker with provided credentials' };
                    }
                    await updateConnectionAssociatedSpaces(this.dbCli, {
                        spaceIds: updatedSpaceIds,
                        broker: broker,
                        username: username,
                    });
                    log.info(`postConnection: spaces associated to connection ${username}@${broker} successfully updated`);
                    return { status: 200, ok: true };
                }
            }
        } catch (err) {
            if (axios.isAxiosError(err) && err.response) {
                log.error(`postConnection: failed to initialize connection ${username}@${broker} with error: ${err.message}`);
                return { status: err.response.status, error: err.message };
            }
            log.error(`postConnection: failed to initialize connection ${username}@${broker} with error: ${err}`);
            return { status: 500, error: 'An error occurred' };
        }
    }
    
    public async deleteMqttConnection(config: BridgeConfigMqtt, mqttConnection: MqttConnectionState, accessToken: string, spaceId: string) {
        const username = mqttConnection.username;
        const broker = mqttConnection.broker;
        try {
            if (!username || !broker) {
                return { status: 400, error: 'this.mqtt username and broker must be provided' };
            }
            const connection = await selectConnection(this.dbCli, {
                broker: broker,
                username: username,
            });
            if (!connection) {
                log.error(`deleteConnection: connection ${username}@${broker} not found`);
                return { status: 404, error: `connection ${username}@${broker} not found` };
            }
            if (!connection.spaceIds.includes(spaceId)) {
                log.error(`deleteConnection: connection ${username}@${broker} not associated with space ${spaceId}`);
                return { status: 404, error: `connection ${username}@${broker} not associated with space ${spaceId}` };
            }
            const { data, status } = await axios.delete(`${config.mqttasAddress}/connection?space_id=${spaceId}&username=${username}&broker=${broker}`,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${accessToken}`
                    },
            });
            if (status !== 200) {
                log.error(`deleteConnection: failed to delete connection ${username}@${broker} with error: ${data.error}`);
                return { status: 404, error: `failed to delete connection ${username}@${broker}` };
            }
            await deleteSpaceFromConnectionAndPrune(this.dbCli, {
                arrayRemove: spaceId,
                broker: broker,
                username: username,
            });
            return { status: 200, ok: true };
        } catch (err) {
            if (axios.isAxiosError(err) && err.response) {
                log.error(`deleteConnection: failed to delete connection ${username}@${broker} with error: ${err.message}`);
                return { status: err.response.status, error: err.message };
            }
            log.error(`deleteConnection: failed to delete connection ${username}@${broker} with error: ${err}`);
            return { status: 500, error: 'An error occurred' };
        }
    }
}

