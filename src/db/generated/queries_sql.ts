import { QueryArrayConfig, QueryArrayResult } from "pg";

interface Client {
    query: (config: QueryArrayConfig) => Promise<QueryArrayResult>;
}

export const selectAllConnectionsQuery = `-- name: SelectAllConnections :many
SELECT broker, client_id, username, password, space_ids, created_at FROM connections`;

export interface SelectAllConnectionsRow {
    broker: string;
    clientId: string;
    username: string;
    password: string;
    spaceIds: string[];
    createdAt: Date;
}

export async function selectAllConnections(client: Client): Promise<SelectAllConnectionsRow[]> {
    const result = await client.query({
        text: selectAllConnectionsQuery,
        values: [],
        rowMode: "array"
    });
    return result.rows.map(row => {
        return {
            broker: row[0],
            clientId: row[1],
            username: row[2],
            password: row[3],
            spaceIds: row[4],
            createdAt: row[5]
        };
    });
}

export const selectSpaceConnectionsQuery = `-- name: SelectSpaceConnections :many
SELECT broker, client_id, username, password, space_ids, created_at FROM connections
WHERE space_ids @> $1`;

export interface SelectSpaceConnectionsArgs {
    spaceIds: string[];
}

export interface SelectSpaceConnectionsRow {
    broker: string;
    clientId: string;
    username: string;
    password: string;
    spaceIds: string[];
    createdAt: Date;
}

export async function selectSpaceConnections(client: Client, args: SelectSpaceConnectionsArgs): Promise<SelectSpaceConnectionsRow[]> {
    const result = await client.query({
        text: selectSpaceConnectionsQuery,
        values: [args.spaceIds],
        rowMode: "array"
    });
    return result.rows.map(row => {
        return {
            broker: row[0],
            clientId: row[1],
            username: row[2],
            password: row[3],
            spaceIds: row[4],
            createdAt: row[5]
        };
    });
}

export const selectConnectionQuery = `-- name: SelectConnection :one
SELECT broker, client_id, username, space_ids FROM connections
WHERE broker = $1
AND username = $2`;

export interface SelectConnectionArgs {
    broker: string;
    username: string;
}

export interface SelectConnectionRow {
    broker: string;
    clientId: string;
    username: string;
    spaceIds: string[];
}

export async function selectConnection(client: Client, args: SelectConnectionArgs): Promise<SelectConnectionRow | null> {
    const result = await client.query({
        text: selectConnectionQuery,
        values: [args.broker, args.username],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0];
    return {
        broker: row[0],
        clientId: row[1],
        username: row[2],
        spaceIds: row[3]
    };
}

export const insertConnectionQuery = `-- name: InsertConnection :one
INSERT INTO connections (broker, client_id, username, password, space_ids)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (broker, username) DO NOTHING
RETURNING broker, username`;

export interface InsertConnectionArgs {
    broker: string;
    clientId: string;
    username: string;
    password: string;
    spaceIds: string[];
}

export interface InsertConnectionRow {
    broker: string;
    username: string;
}

export async function insertConnection(client: Client, args: InsertConnectionArgs): Promise<InsertConnectionRow | null> {
    const result = await client.query({
        text: insertConnectionQuery,
        values: [args.broker, args.clientId, args.username, args.password, args.spaceIds],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0];
    return {
        broker: row[0],
        username: row[1]
    };
}

export const updateConnectionAssociatedSpacesQuery = `-- name: UpdateConnectionAssociatedSpaces :one
UPDATE connections
SET space_ids = $1
WHERE broker = $2
AND username = $3
RETURNING broker, username`;

export interface UpdateConnectionAssociatedSpacesArgs {
    spaceIds: string[];
    broker: string;
    username: string;
}

export interface UpdateConnectionAssociatedSpacesRow {
    broker: string;
    username: string;
}

export async function updateConnectionAssociatedSpaces(client: Client, args: UpdateConnectionAssociatedSpacesArgs): Promise<UpdateConnectionAssociatedSpacesRow | null> {
    const result = await client.query({
        text: updateConnectionAssociatedSpacesQuery,
        values: [args.spaceIds, args.broker, args.username],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0];
    return {
        broker: row[0],
        username: row[1]
    };
}

export const deleteSpaceFromConnectionAndPruneQuery = `-- name: DeleteSpaceFromConnectionAndPrune :exec
WITH updated AS (
    UPDATE connections
    SET space_ids = ARRAY_REMOVE(space_ids, $1)
    WHERE connections.broker = $2 AND connections.username = $3
)
DELETE FROM connections
WHERE ARRAY_LENGTH(space_ids, 1) = 0`;

export interface DeleteSpaceFromConnectionAndPruneArgs {
    arrayRemove: string;
    broker: string;
    username: string;
}

export async function deleteSpaceFromConnectionAndPrune(client: Client, args: DeleteSpaceFromConnectionAndPruneArgs): Promise<void> {
    await client.query({
        text: deleteSpaceFromConnectionAndPruneQuery,
        values: [args.arrayRemove, args.broker, args.username],
        rowMode: "array"
    });
}

