-- name: SelectAllConnections :many
SELECT * FROM connections;

-- name: SelectSpaceConnections :many
SELECT * FROM connections
WHERE space_ids @> $1;

-- name: SelectConnection :one
SELECT broker, client_id, username, space_ids FROM connections
WHERE broker = $1
AND username = $2;

-- name: InsertConnection :one
INSERT INTO connections (broker, client_id, username, password, space_ids)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (broker, username) DO UPDATE
SET (client_id, password, space_ids) = ($2, $4, $5)
RETURNING broker, username;

-- name: UpdateConnectionAssociatedSpaces :one
UPDATE connections
SET space_ids = $1
WHERE broker = $2
AND username = $3
RETURNING broker, username;

-- name: DeleteSpaceFromConnectionAndPrune :exec
WITH updated AS (
    UPDATE connections
    SET space_ids = ARRAY_REMOVE(space_ids, $1)
    WHERE connections.broker = $2 AND connections.username = $3
)
DELETE FROM connections
WHERE ARRAY_LENGTH(space_ids, 1) = 0;
