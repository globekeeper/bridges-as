import { BridgeAuthResponse } from "../Connections";

export interface BridgeAuthEvent {
    hookData: unknown;
    hookId: string;
    username: string;
    password: string;
}

export interface BridgeAuthEventResult {
    successful?: boolean|null;
    response?: BridgeAuthResponse,
    notFound?: boolean;
    unauthorized?: boolean;
}