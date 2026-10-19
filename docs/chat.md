# Chat (Element Web)

The **Chat** section (`/chat`) frames Element Web so team members can use
Matrix without leaving the platform. Accounts are Matrix accounts on the
homeserver, not platform accounts: each person signs in to Element once with
their Matrix username and password, and Element keeps that session in the
browser.

## Topology

```text
Browser ── startup.elarbol.me/chat      → app (page with an <iframe>)
        └─ startup.elarbol.me/element/  → proxy → element:80 (static Element Web)
        └─ https://chat.banond.com      ← Element talks to the homeserver directly
```

- `element` is the unmodified `vectorim/element-web` image, pinned in
  `docker-compose.yml`. It only serves static files.
- `deploy/nginx.conf` serves it on `/element/` of the app origin. Same origin
  is what allows the page to frame it; the proxy sends
  `frame-ancestors 'self'`, so no other site can.
- The homeserver is **not** part of this stack. It is Synapse on
  `https://chat.banond.com` with server name `banond.com` (user IDs look like
  `@name:banond.com`). Its client API allows cross-origin requests.
- Cloudflare Access still guards `/element/` like the rest of the app. Phones
  use the Element app directly with the homeserver `chat.banond.com`.

## Configuration

`deploy/element-config.json` is mounted as Element's `config.json`. It fixes
the homeserver (`disable_custom_urls`), turns off guest access, registration
and password reset in the UI. To use another homeserver, change
`default_server_config` and `room_directory` there and recreate the `element`
container.

Accounts are created on the homeserver (invitation links or the Synapse admin
tools), not in the platform.

## Deploying and upgrading

```bash
docker compose up -d element proxy
```

To upgrade Element, change the pinned tag, run the command above, and check
that `/element/version` reports the new version.
