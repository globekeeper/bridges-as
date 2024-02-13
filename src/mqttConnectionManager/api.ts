export interface MqttConnection {
    broker: string;
    clientId: string;
    username: string;
    password?: string;
    spacesIds?: string[];
    // TODO: Support types of data to be published (multiroom, presence, etc...)
}

export interface GetConnectionsResponse {
    mqttClients: MqttConnection[];
}