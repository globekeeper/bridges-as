MQTT Connection Manager API
-----------------------------

# Overview

# API

Any other response should be considered a failed request (e.g. 404, 502 etc).

## GET /mqtt/liveConnections

Request the MQTT live connections. This route is for internal BE use (for MQTTAS to be able to initialize).

### Response

```json5
{
    [
        {
            "broker": "broker",
            "client_id": "cid",
            "username": "un",
            "password": "pass",
            "spaces_ids": [
                "space1",
                "space2"
            ]
        },
        {
            "broker": "broker2",
            "client_id": "cid2",
            "username": "un2",
            "spaces_ids": [
                "space3",
                "space4"
            ]
        }
    ]
}
```