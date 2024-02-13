<!-- TODO: Adjust this -->

MQTT Connection Manager API
-----------------------------

# Overview

# APIs

## GET /health


### Response

```
HTTP 200
{}
```

Any other response should be considered a failed request (e.g. 404, 502 etc).

## GET /mqtt/connections

Request the MQTT live connections.

### Response

```json5
{
    "mqttClients": [
        {
            "broker": "broker",
            "clientId": "cid",
            "username": "un"
        },
        {
            "broker": "broker2",
            "clientId": "cid2",
            "username": "un2"
        }
    ]
}
```

## POST /mqtt/connection

Creates a MQTT connection for the provided space.

### Request body
```json5
{
    "connection": {
        "broker": "broker",
        "client_id": "un",
        "username": "cid",
        "password": "pass"
    }
}
```

### Response

```
HTTP 200
{}
```

## DELETE /mqtt/connection

Deletes MQTT connection for space. Provide broker, username and space_id in query parameters.

### Response

```
HTTP 200
{}
```