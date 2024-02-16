import { BridgeConfigMqtt, BridgeConfigProvisioning } from "../config/Config";
import { Router, Request, Response, NextFunction } from "express";
import { Logger } from "matrix-appservice-bridge";
import { ApiError, ErrCode } from "../api";
import { selectAllConnections } from "../db/generated/queries_sql";
import { Pool } from "pg";

const log = new Logger("MqttRouter");

export interface AdaptedMqttLiveConnection {
    broker: string;
    client_id: string;
    username: string;
    password: string;
    spaces_ids: string[];
}


export class MqttProvisionerRouter {
    private dbCli: Pool;
    
    constructor(
        private readonly provConfig: BridgeConfigProvisioning) {
            this.provConfig = provConfig;
            this.dbCli = new Pool({ connectionString: process.env.DATABASE_URL });
        }

    public getRouter() {
        const router = Router();
        router.use(this.checkAuth.bind(this));
        router.get("/liveConnections", this.getLiveConnections.bind(this));
        return router;
    }

    private async checkAuth(req: Request, _res: Response, next: NextFunction) {
        // Only provisioning secret is allowed for this auth, since this route is purposed for internal BE use.
        if (req.headers.authorization === `Bearer ${this.provConfig.secret}`) {
            return next();
        }
        throw new ApiError("Unauthorized", ErrCode.BadToken);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private async getLiveConnections(req: Request, res: Response<AdaptedMqttLiveConnection[] | { error: string }>) {
        try {
            const connections = await selectAllConnections(this.dbCli);
            const payloadResp: AdaptedMqttLiveConnection[] = [];
            for (const conn of connections) {
                payloadResp.push({
                    broker: conn.broker,
                    client_id: conn.clientId,
                    username: conn.username,
                    password: conn.password,
                    spaces_ids: conn.spaceIds,
                });
            }
            res.status(200).send(payloadResp);
        } catch (err) {
            log.error(`getLiveConnections: An error occurred: ${err}`);
            res.status(500).send({ error: `unable to fetch connections: ${err.message}` });
        }
    }
}
