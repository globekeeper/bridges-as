import { Connection, IConnection, IConnectionState, InstantiateConnectionOpts, ProvisionConnectionOpts } from "./IConnection";
import { BaseConnection } from "./BaseConnection";
import { randomUUID } from 'node:crypto';
import { GetConnectionsResponseItem } from "../provisioning/api";
import { Intent, StateEvent } from "matrix-bot-sdk";
import { Logger } from "matrix-appservice-bridge";
import { BridgeConfigMqtt } from "../config/Config";
import { MqttConnectionsManager } from "../mqtt/mqttConnectionManager";

const log = new Logger("MqttConnection");

export interface MqttConnectionState extends IConnectionState {
    broker: string;
    clientId: string;
    username: string;
    password?: string;
    spacesIds?: string[];
    // TODO: Support types of data to be published (multiroom, presence, etc...)
}

export type MqttResponseItem = GetConnectionsResponseItem<MqttConnectionState>;

/**
 * MqttConnection is different from other connections in that it is not just a direct bridge connection to a service, but also indicates a live connection to a broker.
 * It persists the credentials for connections in the local DB, rather than state events, like other connections.
 */
@Connection
export class MqttConnection extends BaseConnection implements IConnection {
    static readonly CanonicalEventType = "gk.bridgeas.mqtt";
    static readonly ServiceCategory = "mqtt";
    static connectionManager = new MqttConnectionsManager();
    static config: BridgeConfigMqtt;
    static state: MqttConnectionState;
    
    constructor(
        roomId: string,
        private state: MqttConnectionState,
        public readonly hookId: string,
        private readonly intent: Intent,
        private readonly config: BridgeConfigMqtt,
    ) {
        super(roomId, roomId, MqttConnection.CanonicalEventType);
        this.config = config;
        this.state = state;
    }
    
    // Placeholder to fulfill the IConnection interface
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public isInterestedInStateEvent(eventType: string, stateKey: string) {
        return false;
    }
    static async createConnectionForState(roomId: string, event: StateEvent<Record<string, unknown>>, { intent, config }: InstantiateConnectionOpts) {
        return new MqttConnection(roomId, {
            broker: '',
            clientId: '',
            username: '',
        }, randomUUID(), intent, config.mqtt as BridgeConfigMqtt);
    }
    static readonly EventTypes = [
        MqttConnection.CanonicalEventType,
    ];

    static validateState(state: Record<string, unknown>): MqttConnectionState {
        const broker = state.broker as string;
        const clientId = state.client_id as string;
        const username = state.username as string;
        const password = state.password as string;
        if (!broker || !clientId || !username || !password) {
            throw Error('Missing values in request payload');
        }    
        return { 
            broker,
            clientId,
            username,
            password,
         };   
    }     

    // This shall be called by the *provisioner* PUT /connection API:
    // 1. Create a BridgeAS connection
    // 2. Execute the MQTT connection management logic (store MQTT creds + update mqttas to connect to broker / associate a live connection with a space)
    static async provisionConnection(roomId: string, userId: string, data: Record<string, unknown> = {}, { intent, config }: ProvisionConnectionOpts) {
        if (!config.mqtt) {
            throw Error('MQTT integration is not enabled');
        }
        const validState = MqttConnection.validateState(data);
        const resp = await this.connectionManager.createMqttConnection(config.mqtt, validState, intent.underlyingClient.accessToken, roomId);
        if (resp.status != 200) {
            throw Error(`Failed to provision MQTT connection with status ${resp.status} and error ${resp.error}`);
        }
        const hookId = randomUUID();
        const obfuscatedData: MqttConnectionState = {
            broker: validState.broker,
            clientId: validState.clientId,
            username: validState.username,
        };
        const connection = new MqttConnection(roomId, obfuscatedData, hookId, intent, config.mqtt);
        return {
            connection,
        }
    }

    // This shall be called by the *provisioner* DELETE /connections API and execute the MQTT connection deletion logic:
    // 1. Disassociate the MQTT connection from the space
    // 2. Delete the connection if it's not associated with any other space
    public async onRemove() {
        log.info(`Disassociating ${this.toString()} from ${this.roomId}`);
        const resp = await MqttConnection.connectionManager.deleteMqttConnection(this.config, this.state, this.intent.underlyingClient.accessToken, this.roomId);
        if (resp.status != 200) {
            throw Error(`Failed to provision MQTT connection with status ${resp.status} and error ${resp.error}`);
        }
    }

    public static getProvisionerDetails(botUserId: string) {
        return {
            service: MqttConnection.ServiceCategory,
            eventType: MqttConnection.CanonicalEventType,
            type: MqttConnection.ServiceCategory,
            botUserId,
        }
    }

    public getProvisionerDetails(): MqttResponseItem {
        return {
            ...MqttConnection.getProvisionerDetails(this.intent.userId),
            id: this.connectionId,
            config: {
                broker: this.state.broker,
                clientId: this.state.clientId,
                username: this.state.username,
            },
        }
    }

    public toString() {
        return `MqttConnection ${this.hookId}`;
    }
}