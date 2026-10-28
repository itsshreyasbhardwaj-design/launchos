# Deployment

## Local (what it is built for)

```bash
npm install && npm run build:core && node bin/launchos.mjs init
npm run dev        # development
npm run build && npm start   # production build, still local
```

The database is `data/launchos.db`. Back it up by copying the file.

## Self-hosting

LaunchOS has **no authentication**. It holds unreleased plans, private business
records and crawl results. Before putting it on any network:

1. Put a reverse proxy with authentication in front of it (Caddy with
   `basicauth`, nginx with auth_request, Cloudflare Access, or a Tailscale
   private network).
2. Bind to localhost and let the proxy terminate TLS.
3. Keep `data/` on a volume you back up.
4. Do not expose it publicly. There is no multi-tenant model and no
   authorization layer beyond project scoping.

### Docker

No Dockerfile ships, deliberately: the local workflow is `npm install` and two
commands, and a container adds a layer for no gain. If you want one, the only
requirements are Node 22.5+ and a persistent volume for `data/`.

## Serverless

Not supported, and the reason is structural. `node:sqlite` needs a persistent
filesystem; the crawler needs outbound network and long-running requests. An
audit of 40 pages at 750ms per host exceeds most serverless time limits.

To run it hosted, use a small VM or a container host with a volume. To use
Postgres instead, see the mapping in [ARCHITECTURE.md](ARCHITECTURE.md) — it is
a dialect change, not a rewrite.

## CLI-only

The dashboard is optional. For a server or a CI runner:

```bash
npm install --omit=dev && npm run build:core
node bin/launchos.mjs audit --project my-app --json > audit.json
```

Every command supports `--json`.

## Upgrading

Migrations are forward-only and applied automatically on open. Back up
`data/launchos.db` first; there is no down-migration path.
