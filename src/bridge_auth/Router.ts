import { MessageQueue } from "../MessageQueue";
import express, { NextFunction, Request, Response, Router } from "express";
import { Logger } from "matrix-appservice-bridge";
import * as xml from "xml2js";
import { BridgeAuthEvent, BridgeAuthEventResult } from "./types";
import { emailFormat } from "../IntentUtils";

type RequestBody = {
    data: {
        username: string;
        password: string;
    };
};

const WEBHOOK_RESPONSE_TIMEOUT = 5000;
const log = new Logger('BridgeAuthRouter');
export class BridgeAuthRouter {
    constructor(private readonly queue: MessageQueue, private readonly deprecatedPath = false, private readonly allowGet: boolean) { }

    private onWebhook(req: Request<{ hookId: string }, unknown, unknown, unknown>, res: Response<unknown | { ok: false, error: string }>) {    
        const payload: RequestBody = req.body as RequestBody;
        if (!payload.data || !payload.data.username || !payload.data.password) {
            res.status(400).send({ error: "Missing required credentials" });
            return;
        }
        const { username, password } = payload.data;
        if (!emailFormat.test(username)) {
            res.status(400).send({ error: "Username has to be a valid email address" });
            return;
        }
        this.queue.pushWait<BridgeAuthEvent, BridgeAuthEventResult>({
            eventName: 'bridge_auth.event',
            sender: "bridge_auth",
            data: {
                hookData: payload,
                hookId: req.params.hookId,
                username: username,
                password: password,
            },
        }, WEBHOOK_RESPONSE_TIMEOUT).then((response) => {
            if (response.successful && response.response !== undefined) {
                if (response.response.contentType) {
                    res.contentType(response.response.contentType);
                }
                delete response.response.unauthorized;
                const responseBody = response.response.body ? response.response.body : response.response;
                res.status(200).send(responseBody);
            } else if (response.unauthorized) {
                if (response.response?.contentType) {
                    res.contentType(response.response.contentType);
                }
                res.status(401).send({ error: response.response?.body });
            } else if (response.notFound) {
                res.status(404).send({ ok: false, error: "Auth not found" });
            } else {
                res.status(500).send({ ok: false, error: "Failed to process webhook" });
            }
        }).catch((err) => {
            log.error(`Failed to emit payload: ${err}`);
            res.status(500).send({ ok: false, error: "Failed to handle bridge auth" });
        });
    }

    private static xmlHandler(req: Request, res: Response, next: NextFunction) {
        express.text({ type: ["*/xml", "+xml"] })(req, res, (err) => {
            if (err) {
                next(err);
                return;
            }
            if (typeof req.body !== 'string') {
                next();
                return;
            }
            xml.parseStringPromise(req.body).then(xmlResult => {
                req.body = xmlResult;
                next();
            }).catch(e => {
                res.statusCode = 400;
                next(e);
            });
        });
    }

    public getRouter() {
        const router = Router();
        router.post(
            "/:hookId",
            BridgeAuthRouter.xmlHandler,
            express.urlencoded({ extended: false }),
            express.json(),
            express.text({ type: 'text/*' }),

            this.onWebhook.bind(this)
        );
        return router;
    }
}