Matrix Hookshot
===============

[![#hookshot:half-shot.uk](https://img.shields.io/matrix/hookshot:half-shot.uk.svg?server_fqdn=chaotic.half-shot.uk&label=%23hookshot:half-shot.uk&logo=matrix)](https://matrix.to/#/#hookshot:half-shot.uk)
[![Docker Image Version (latest by date)](https://img.shields.io/docker/v/halfshot/matrix-hookshot?sort=semver)](https://hub.docker.com/r/halfshot/matrix-hookshot)

![screenshot](screenshot.png)

A Matrix bot for connecting to external services like GitHub, GitLab, JIRA, and more.

- Several services are supported out of the box.
- [Webhooks](https://matrix-org.github.io/matrix-hookshot/latest/setup/webhooks.html) let you connect all kinds of services, with the ability to write rich templates using JavaScript.
- **No external database** is required, instead using Matrix state as a persistent store.
- End-to-Bridge encryption allows bots to be used in encrypted Matrix rooms.
- [Powerful widgets](https://matrix-org.github.io/matrix-hookshot/latest/advanced/widgets.html) let you configure Hookshot from a room or the Element Extensions Store.

We richly support the following integrations:

- [Figma](https://matrix-org.github.io/matrix-hookshot/latest/setup/figma.html)
- [Generic Webhooks](https://matrix-org.github.io/matrix-hookshot/latest/setup/webhooks.html)
- [GitHub](https://matrix-org.github.io/matrix-hookshot/latest/setup/github.html)
- [GitLab](https://matrix-org.github.io/matrix-hookshot/latest/setup/gitlab.html)
- [Jira](https://matrix-org.github.io/matrix-hookshot/latest/setup/jira.html)
- [RSS/Atom feeds](https://matrix-org.github.io/matrix-hookshot/latest/setup/feeds.html)

Get started by reading [the setup guide](https://matrix-org.github.io/matrix-hookshot/latest/setup.html)!


## Documentation

Documentation can be found on [GitHub Pages](https://matrix-org.github.io/matrix-hookshot).

You can build the documentation yourself by typing:
```sh
# cargo install mdbook
mdbook build
sensible-browser book/index.html
```

### GlobeKeeper Related Docs

[Notion PRD](https://www.notion.so/globekeeper/Integrations-Service-3792bbf7cb0b453380f576a4d1683268?pvs=4)

The current GlobeKeeper customization to original hookshot can be divided into 2 different main functionalities:

1. Provisioning the space-associated bridged-external-authentication:
    
    This provisioning endpoint is responsible of introducing a new type of service to hookshot, and by triggering the provisioner with that type, the bride will establish a new route that will authenticate/register users from external systems (currently supporting only GeoDome POST login payload) according to the provided external auth provider URL and name and the path-embedded spaceId. This endpoint is authorized using the unique provisioning secret from the config.

    [This is the API for provisioning](https://globekeeper.postman.co/workspace/GlobeKeeper-Workspace~f5ae58c4-4f28-4de4-accd-be7c7f041c57/request/13078936-153e2f3e-e0a3-44d4-9261-b3ed873d9bc1?active-environment=c409c387-7381-4861-ac2c-aa5f9c8ac1a0) (Should be sent by VCP client when clicking on e.g - "Integrate Space" in the space settings).


2. Actual authentication logic:

    The actual authentication logic that is triggered by the newly created route from the provisioner.
    Making a request to the generated endpoint will execute the following logic:
    - Authenticate against the configured external-auth-provider URL (this URL is an argument to the provisioning API) ->
    - if authenticated, continues, else it returns 401 ->
        - If the user is already registered in Dendrite -> Logs-in and returns homeserver credentials (userId, deviceId and access token)
        - If the user isn't already registered in Dendrite -> Registers the user with the format `@{{localpart from email}}-{{name of external auth provider, provided in the provisioning API}}:{{homeserverUrl}}` -> join the newly created user to the space configured with this bridged-auth and returns homeserver credentials (homeserver name, userId, deviceId and access token)

    [This is the bridged login endpoint](https://globekeeper.postman.co/workspace/GlobeKeeper-Workspace~f5ae58c4-4f28-4de4-accd-be7c7f041c57/request/13078936-455cf8c0-e1d6-4a41-a6cc-7cafab36084d?active-environment=c409c387-7381-4861-ac2c-aa5f9c8ac1a0) (what GeoDome would use essentially):

#### Coming-up:

1. Traccar integration for supporting incoming GPS devices location updates and streaming them to the homeserver in a way that would allow displaying them on the map in configured rooms.
2. ... 🤩

### Debugging

For debugging purposes, toggle auto-attach in VS Code:
1. `cmnd+shift+p`
2. `Debug: Toggle Auto Attach`
3. `yarn`
4. `yarn start`

## Contact

We have a Matrix support room ([#hookshot:half-shot.uk](https://matrix.to/#/#hookshot:half-shot.uk)).
