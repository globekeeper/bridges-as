import { Connection, IConnection, IConnectionState, InstantiateConnectionOpts, ProvisionConnectionOpts } from "./IConnection";
import { Logger } from "matrix-appservice-bridge";
import { MessageSenderClient } from "../MatrixSender"
import { QuickJSWASMModule, newQuickJSWASMModule } from "quickjs-emscripten";
import { MatrixEvent } from "../MatrixEvent";
import { Appservice, Intent, StateEvent } from "matrix-bot-sdk";
import { ApiError, ErrCode } from "../api";
import { BaseConnection } from "./BaseConnection";
import { GetConnectionsResponseItem } from "../provisioning/api";
import { BridgeConfigAuth } from "../config/Config";
import { matrixUsernameAllowedCharacters  } from "../IntentUtils";
import { randomUUID } from 'node:crypto';
import axios from "axios";
import qs from 'qs';

export interface BridgeAuthConnectionState extends IConnectionState {
    /**
     * This is ONLY used for display purposes, but the account data value is used to prevent misuse.
     */
    hookId?: string;
    /**
     * The name of the external auth provider given in the provisioning UI.
    */
    name: string;
    /**
     * The URL of the external auth provider given in the provisioning UI.
    */
    url: string;
}

export interface BridgeAuthSecrets {
    /**
     * The public URL for the BridgeAuth.
     */
    url: URL;
    /**
     * The hookId of the BridgeAuth.
     */
    hookId: string;
}

export type BridgeAuthResponseItem = GetConnectionsResponseItem<BridgeAuthConnectionState, BridgeAuthSecrets>;

/** */
export interface BridgeAuthAccountData {
    /**
     * This is where the true hook ID is kept. Each hook ID maps to a state_key.
     */
    [hookId: string]: string;
}

export interface BridgeAuthResponse {
    body: unknown;
    unauthorized?: boolean;
    contentType?: string;
}

const log = new Logger("BridgeAuthConnection");

const SANITIZE_MAX_DEPTH = 10;
const SANITIZE_MAX_BREADTH = 50;

/**
 * Handles rooms connected to a BridgeAuth hook.
 */
@Connection
export class BridgeAuthConnection extends BaseConnection implements IConnection {
    private static quickModule?: QuickJSWASMModule;

    public static async initialiseQuickJS() {
        BridgeAuthConnection.quickModule = await newQuickJSWASMModule();
    }

    /**
     * Ensures a JSON payload is compatible with Matrix JSON requirements, such
     * as disallowing floating point values.
     *
     * If the `depth` exceeds `SANITIZE_MAX_DEPTH`, the value of `data` will be immediately returned.
     * If the object contains more than `SANITIZE_MAX_BREADTH` entries, the remaining entries will not be checked.
     *
     * @param data The data to santise
     * @param depth The depth of the `data` relative to the root.
     * @param breadth The breadth of the `data` in the parent object.
     * @returns
     */
    static sanitiseObjectForMatrixJSON(data: unknown, depth = 0, breadth = 0): unknown {
        // Floats
        if (typeof data === "number" && !Number.isInteger(data)) {
            return data.toString();
        }
        // Primitive types
        if (typeof data !== "object" || data === null) {
            return data;
        }

        // Over processing limit, return string.
        if (depth > SANITIZE_MAX_DEPTH || breadth > SANITIZE_MAX_BREADTH) {
            return JSON.stringify(data);
        }

        const newDepth = depth + 1;
        if (Array.isArray(data)) {
            return data.map((d, innerBreadth) => this.sanitiseObjectForMatrixJSON(d, newDepth, innerBreadth));
        }

        let objBreadth = 0;
        const obj: Record<string, unknown> = { ...data };
        for (const [key, value] of Object.entries(data)) {
            obj[key] = this.sanitiseObjectForMatrixJSON(value, newDepth, ++objBreadth);
        }

        return obj;
    }

    static validateState(state: Record<string, unknown>): BridgeAuthConnectionState {
        let name = state.name as string;
        let url = state.url as string;
        name = name.toLowerCase();
        url = url.toLowerCase();
        if (!url) {
            throw new ApiError('Missing external auth provider URL', ErrCode.BadValue);
        }
        // 'username can only contain characters a-z, 0-9, or '_ -./=''
        if (typeof name !== "string") {
            throw new ApiError("'name' must be a string", ErrCode.BadValue);
        }
        if (!matrixUsernameAllowedCharacters.test(name)) {
            throw new ApiError("'name' must consist on a-z, 0-9, or '_ -./=", ErrCode.BadValue);
        }
        return { url, name };
    }

    static async createConnectionForState(roomId: string, event: StateEvent<Record<string, unknown>>, {as, intent, config, messageClient}: InstantiateConnectionOpts) {
        if (!config.bridgeAuth) {
            throw Error('BridgeAuth webhooks are not configured');
        }
        // BridgeAuth hooks store the hookId in the account data
        const acctData = await intent.underlyingClient.getSafeRoomAccountData<BridgeAuthAccountData>(BridgeAuthConnection.CanonicalEventType, roomId, {});
        const state = this.validateState(event.content);
        // hookId => stateKey
        let hookId = Object.entries(acctData).find(([, v]) => v === event.stateKey)?.[0];
        if (!hookId) {
            hookId = randomUUID();
            log.warn(`hookId for ${roomId} not set in accountData, setting to ${hookId}`);
            await BridgeAuthConnection.ensureRoomAccountData(roomId, intent, hookId, event.stateKey);
        }

        return new BridgeAuthConnection(
            roomId,
            state,
            hookId,
            event.stateKey,
            messageClient,
            config.bridgeAuth,
            as,
            intent,
        );
    }

    static async provisionConnection(roomId: string, userId: string, data: Record<string, unknown> = {}, {as, intent, config, messageClient}: ProvisionConnectionOpts) {
        if (!config.bridgeAuth) {
            throw Error('BridgeAuth webhooks are not configured');
        }
        const hookId = randomUUID();
        const validState = BridgeAuthConnection.validateState(data);
        await BridgeAuthConnection.ensureRoomAccountData(roomId, intent, hookId, validState.name);
        await intent.underlyingClient.sendStateEvent(roomId, this.CanonicalEventType, validState.name, validState);
        const connection = new BridgeAuthConnection(roomId, validState, hookId, validState.name, messageClient, config.bridgeAuth, as, intent);
        return {
            connection,
            stateEventContent: validState,
        }
    }

    /**
     * This function ensures the account data for a room contains all the hookIds for the various state events.
     */
    static async ensureRoomAccountData(roomId: string, intent: Intent, hookId: string, stateKey: string, remove = false) {
        const data = await intent.underlyingClient.getSafeRoomAccountData<BridgeAuthAccountData>(BridgeAuthConnection.CanonicalEventType, roomId, {});
        if (remove && data[hookId] === stateKey) {
            delete data[hookId];
            await intent.underlyingClient.setRoomAccountData(BridgeAuthConnection.CanonicalEventType, roomId, data);
        }
        if (!remove && data[hookId] !== stateKey) {
            data[hookId] = stateKey;
            await intent.underlyingClient.setRoomAccountData(BridgeAuthConnection.CanonicalEventType, roomId, data);
        }
    }

    static readonly CanonicalEventType = "uk.half-shot.matrix-hookshot.bridge_auth.hook";
    static readonly LegacyCanonicalEventType = "uk.half-shot.matrix-github.bridge_auth.hook";
    static readonly ServiceCategory = "bridgeAuth";

    static readonly EventTypes = [
        BridgeAuthConnection.CanonicalEventType,
        BridgeAuthConnection.LegacyCanonicalEventType,
    ];

    private transformationFunction?: string;
    private cachedDisplayname?: string;
    /**
     * @param state Should be a pre-validated state object returned by {@link validateState}
     */
    constructor(
        roomId: string,
        private state: BridgeAuthConnectionState,
        public readonly hookId: string,
        stateKey: string,
        private readonly messageClient: MessageSenderClient,
        private readonly config: BridgeConfigAuth,
        private readonly as: Appservice,
        private readonly intent: Intent,
    ) {
        super(roomId, stateKey, BridgeAuthConnection.CanonicalEventType);
    }

    /**
     * Should the BridgeAuth handler wait for this to finish before
     * sending a response back.
     */
    public get externalAuthProviderURL(): string {
        return this.state.url ?? "";
    }

    public get priority(): number {
        return this.state.priority || super.priority;
    }

    public isInterestedInStateEvent(eventType: string, stateKey: string) {
        return BridgeAuthConnection.EventTypes.includes(eventType) && this.stateKey === stateKey;
    }

    public async ensureDisplayname(intent: Intent) {
        if (!this.state.name) {
            return;
        }
        if (this.intent.userId === intent.userId) {
            // Don't set a displayname on the root bot user.
            return;
        }
        await intent.ensureRegistered();
        const expectedDisplayname = `${this.state.name} (BridgeAuth)`;

        try {
            if (this.cachedDisplayname !== expectedDisplayname) {
                this.cachedDisplayname = (await intent.underlyingClient.getUserProfile(this.intent.userId)).displayname;
            }
        } catch (ex) {
            // Couldn't fetch, probably not set.
            this.cachedDisplayname = undefined;
        }
        if (this.cachedDisplayname !== expectedDisplayname) {
            await intent.underlyingClient.setDisplayName(`${this.state.name} (BridgeAuth)`);
            this.cachedDisplayname = expectedDisplayname;
        }
    }

    public async onStateUpdate(stateEv: MatrixEvent<unknown>) {
        const validatedConfig = BridgeAuthConnection.validateState(stateEv.content as Record<string, unknown>);
        this.state = validatedConfig;
    }

    /**
     * Processes an incoming BridgeAuth event.
     * @param email The original email of the user in the external auth provider.
     * @param password The original password of the user in the external auth provider.
     * @description Used to authenticate the user against the external auth provider, and then either register or login the user against the Connnect homeserver.
     * @returns `true` if the BridgeAuth completed, or `false` if it failed to complete
     * @returns `BridgeAuthResponse` if the BridgeAuth completed, or `undefined` if it failed to complete. Responds with the response from the homeserver auth API call.
     */
    public async onBridgeAuthHook(email: string, password: string): Promise<{successful: boolean, response?: BridgeAuthResponse}> {
        const localPart = email.split('@')[0];
        const matrixUsername = `@${localPart}-${this.state.name}:${this.config.domain}`;
        const sender = this.as.getIntentForUserId(matrixUsername);

        // Authenticate against GeoDome
        const result = {
            body: {},
            unauthorized: true,
        };
        try {
            const reqConfig = {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'Accept': '*/*',
                },
            };
            await axios.post(this.state.url, qs.stringify({
                email,
                password,
            }), reqConfig);
            result.unauthorized = false;
        } catch (err) {
            log.error(`External auth failed with ${err.response.data.errors[0]}`);
            return { successful: false, response: { body: err.response.data.errors[0], unauthorized: true, contentType: "text/plain" } };
        }
                
        // Authenticate / register against Dendrite
        // Note: We register users with the `-{{space_id}}` suffix to prevent collisions between users on different spaces.
        // This means that 2 users with the same email address on different spaces will have different usernames on homeserver.
        try {
            const whoami = await sender.underlyingClient.getWhoAmI()
            const respLogin = await sender.underlyingClient.doRequest("POST", "/_matrix/client/v3/login", null, {

                type: "m.login.application_service",
                identifier: {
                    type: "m.id.user",
                    user: whoami.user_id,
                },
            });
            result.body = respLogin;
        } catch (ex) {
            if (ex.errcode === "M_FORBIDDEN") {
                // User is not registered, register them.
                try {
                    // Sending the email and space_id in the request is for adminas to be able to generate an invitation record. Dendrite will not use it.
                    const respRegister = await sender.underlyingClient.doRequest("POST", "/_matrix/client/v3/register", null, {
                        type: "m.login.application_service",
                        username: matrixUsername.substring(1).split(":")[0],
                        email,
                        space_id: this.roomId,
                    });
                    result.body = respRegister;
                    const registeredUser = this.as.getIntentForUserId(respRegister.user_id);
                    await registeredUser.joinRoom(this.roomId)
                } catch (e) {
                    log.error(`failed to register or join user to space: ${e}`);
                    return { successful: false, response: { body: "failed to register user", unauthorized: true, contentType: "text/plain" } };
                }
            } else {
                log.error(`failed to authenticate user against homeserver: ${ex}`);
                return { successful: false, response: { body: "failed to authenticate user", unauthorized: true, contentType: "text/plain" } };
            }
        }

        return {
            successful: true,
            response: result,
        };
    }

    public static getProvisionerDetails(botUserId: string) {
        return {
            service: "bridgeAuth",
            eventType: BridgeAuthConnection.CanonicalEventType,
            type: "bridgeAuth",
            // TODO: Add ability to configure the bot per connnection type.
            botUserId: botUserId,
        }
    }

    public getProvisionerDetails(showSecrets = false): BridgeAuthResponseItem {
        return {
            ...BridgeAuthConnection.getProvisionerDetails(this.intent.userId),
            id: this.connectionId,
            config: {
                url: this.state.url,
                name: this.state.name,
            },
            ...(showSecrets ? { secrets: {
                url: new URL(this.hookId, this.config.parsedUrlPrefix),
                hookId: this.hookId,
            } as BridgeAuthSecrets} : undefined)
        }
    }

    public async onRemove() {
        log.info(`Removing ${this.toString()} for ${this.roomId}`);
        // Do a sanity check that the event exists.
        try {
            await this.intent.underlyingClient.getRoomStateEvent(this.roomId, BridgeAuthConnection.CanonicalEventType, this.stateKey);
            await this.intent.underlyingClient.sendStateEvent(this.roomId, BridgeAuthConnection.CanonicalEventType, this.stateKey, { disabled: true });
        } catch (ex) {
            await this.intent.underlyingClient.getRoomStateEvent(this.roomId, BridgeAuthConnection.LegacyCanonicalEventType, this.stateKey);
            await this.intent.underlyingClient.sendStateEvent(this.roomId, BridgeAuthConnection.LegacyCanonicalEventType, this.stateKey, { disabled: true });
        }
        await BridgeAuthConnection.ensureRoomAccountData(this.roomId, this.intent, this.hookId, this.stateKey, true);
    }

    public async provisionerUpdateConfig(userId: string, config: Record<string, unknown>) {
        // Apply previous state to the current config, as provisioners might not return "unknown" keys.
        config = { ...this.state, ...config };
        const validatedConfig = BridgeAuthConnection.validateState(config);
        await this.intent.underlyingClient.sendStateEvent(this.roomId, BridgeAuthConnection.CanonicalEventType, this.stateKey,
            {
                ...validatedConfig,
                hookId: this.hookId
            }
        );
        this.state = validatedConfig;
    }

    public toString() {
        return `BridgeAuthConnection ${this.hookId}`;
    }
}