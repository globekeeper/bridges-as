import { MessageQueue } from "../MessageQueue";
import express, { NextFunction, Request, Response, Router } from "express";
import { Logger } from "matrix-appservice-bridge";
import * as xml from "xml2js";

// import { ApiError, ErrCode } from "../api";
// import { TraccarEvent, TraccarEventResult } from "./types";

const log = new Logger('TraccarRouter');
export class TraccarWebhooksRouter {
    constructor(private readonly queue: MessageQueue, private readonly deprecatedPath = false, private readonly allowGet: boolean) { }

    private onWebhook(req: Request<{ hookId: string }, unknown, unknown, unknown>, res: Response<unknown | { ok: false, error: string }>) {
        // TODO: Make sure this is exactly what we want right here
        log.debug(`🐛 DEBUGGING: Got traccar webhook`);
        const payload = req.body;
        log.debug(`🐛 DEBUGGING: Got traccar webhook with payload ${JSON.stringify(payload)}`);
        // TODO: Validate payload or whatever else
        // TODO: Do we even wanna respond to traccar which is not a server we manage?
        // if () {
        //     res.sendStatus(401);
        //     return;
        // }
        // if (typeof payload.SOMETHING !== "string" || typeof payload.SOMETHING_ELSE !== "string") {
        //     res.status(400).send({ error: "Missing required object keys SOMETHING, SOMETHING_ELSE" });
        //     return;
        // }
        res.status(200).send();
        this.queue.push({
            "eventName": "traccar-webhook.incoming",
            sender: "GithubWebhooks",
            data: {
                hookData: payload,
                hookId: req.params.hookId,
            },
        }).catch((err) => {
            log.error(`Failed to emit payload: ${err}`);
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
            TraccarWebhooksRouter.xmlHandler,
            express.urlencoded({ extended: false }),
            express.json(),
            express.text({ type: 'text/*' }),

            this.onWebhook.bind(this)
        );
        return router;
    }
}