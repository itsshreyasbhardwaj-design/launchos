# Setup

## Requirements

- **Node.js 22.5 or newer.** `node:sqlite` ships inside Node from 22.5, and
  LaunchOS uses it instead of a native driver. Check with `node -v`.
- Nothing else. No database service, no Docker, no accounts, no API keys.

## Install

```bash
npm install
npm run build:core          # compiles src/core and src/cli to dist/
node bin/launchos.mjs init  # creates data/launchos.db, seeds 39 directories and 31 tools
```

Then either interface:

```bash
npm run dev                 # dashboard on http://localhost:3211
node bin/launchos.mjs --help
```

Optionally link the CLI: `npm link`, then `launchos` works anywhere.

## First run

```bash
# 1. Create a project
launchos project add --name "Acme Router" --url https://acme.example \
  --preset saas --country IN --category "developer tooling"

# 2. Authorize the host you control. Audits are blocked until you do.
launchos domains authorize acme.example --note "I own the DNS zone" --by "your name"

# 3. Fill in the canonical brand profile
launchos brand set --field tagline --value "Route work without meetings"
launchos brand set --field shortDescription --value "..."
launchos brand set --field features --value "Rule-based routing,Local-first storage"
launchos brand set --field pricingModel --value "Free and open source"

# 4. Mark facts verified once you have checked them
launchos brand verify --field pricingModel --how "checked against the live pricing page"

# 5. Record the assets you actually have
launchos assets add --kind screenshot --label "routing rules" --path ./assets/shot-1.png

# 6. Audit
launchos audit --pages 30 --depth 2
launchos audit findings

# 7. Search data, keywords, plan
launchos seo import ~/Downloads/Queries.csv --provider google_search_console
launchos seo cluster
launchos seo strategy

# 8. GEO
launchos geo check
launchos geo schema --out public/schema.jsonld
launchos geo queries

# 9. Directories and listings
launchos directories verify
launchos directories match
launchos listings prepare alternativeto
launchos listings approve alternativeto --by "your name"
launchos listings instructions alternativeto     # the exact steps to submit by hand

# 10. Where to go next
launchos opportunities
launchos readiness
launchos report --period weekly
```

## Doctor

```bash
launchos doctor
```

Checks the Node version, the database, migrations, registry seeding, outbound
HTTPS, that the SSRF guard blocks link-local addresses, whether Lighthouse is
available, and confirms that no paid service is required.

## Environment

Every variable is optional. `.env.example` documents them all.

| Variable | Default | Purpose |
| --- | --- | --- |
| `LAUNCHOS_DB` | `./data/launchos.db` | Database path |
| `LAUNCHOS_CRAWL_MAX_PAGES` | `40` | Hard page cap per audit |
| `LAUNCHOS_CRAWL_DELAY_MS` | `750` | Per-host delay between requests |
| `LAUNCHOS_CRAWL_TIMEOUT_MS` | `15000` | Per-request timeout |
| `LAUNCHOS_USER_AGENT` | `LaunchOS-Audit/0.1` | Crawler identity |
| `LAUNCHOS_ALLOW_PRIVATE_HOSTS` | unset | **Disables private-IP blocking.** Only on a trusted network you own |
| `LAUNCHOS_PROJECT` | unset | Default project for the CLI |
| `INDEXNOW_KEY` | unset | Fallback IndexNow key |

## Multiple projects

One install runs as many as you like. The dashboard has a project switcher; the
CLI takes `--project <slug>`. Records are isolated per project and deletes
cascade, which `tests/security.test.ts` verifies.
