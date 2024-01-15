import { TraccarResponse } from "../Connections";

export interface TraccarEvent {
    hookData: unknown;
    hookId: string;
}

export interface TraccarEventResult {
    successful?: boolean|null;
    response?: TraccarResponse,
    notFound?: boolean;
}