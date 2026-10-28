# Architecture

## Layers

```
┌──────────────────────┐   ┌──────────────────────┐
│  Next.js dashboard   │   │  launchos CLI        │
│  src/app (28 routes) │   │  src/cli             │
│  server actions      │   │  dist/cli/main.js    │
└──────────┬───────────┘   └──────────┬───────────┘
           │                          │
           └────────────┬─────────────┘
                        ▼
              ┌───────────────────┐
              │   src/core        │  domain layer
              │   zero runtime    │  no React, no Next.js,
              │   dependencies    │  no third-party packages
              └─────────┬─────────┘
                        ▼
              ┌───────────────────┐
              │   node:sqlite     │  built into Node 22.5+
              └───────────────────┘
```

Both consumers import the same service functions. There is no second
implementation of any rule, which is why an approval gate that refuses a listing
in the terminal refuses it in the browser for the same reason, with the same
message.

The dashboard imports `src/core` directly as TypeScript. The CLI imports a
CommonJS build from `dist/` produced by `tsconfig.core.json`; `dist/package.json`
pins `{"type":"commonjs"}` so the build coexists with the ESM project.

## Why node:sqlite

The brief asked for SQLite with Drizzle or Prisma. LaunchOS uses `node:sqlite`,
which has shipped inside Node since 22.5, with hand-written versioned migrations
and a thin typed repository layer.

The reason is the free-first constraint taken seriously: `better-sqlite3` needs a
native build (a working toolchain, or a prebuilt binary for your exact platform),
and an ORM adds a dependency and a code-generation step to a schema that is
written once. `node:sqlite` needs neither. `npm install` pulls Next, React and
Zod; the entire data layer needs nothing.

The cost is no query builder and no generated types. The repository layer is
hand-written and each row mapper is explicit. For a 36-table schema that is a
few hundred lines, and it keeps the core importable by anything.

## Data model

36 tables across six groups. All timestamps are ISO-8601 strings, all primary
keys are prefixed text ids (`prj_`, `aud_`, `dir_`), and foreign keys cascade.

| Group | Tables |
| --- | --- |
| Core | `workspaces`, `projects`, `brand_profiles`, `project_domains`, `project_assets`, `project_integrations`, `audit_events` |
| Audits | `site_audits`, `audit_pages`, `audit_findings`, `performance_results`, `structured_data_results` |
| SEO | `keyword_opportunities`, `keyword_clusters`, `content_pages`, `seo_tasks`, `content_briefs`, `search_performance_imports` |
| GEO | `ai_search_queries`, `ai_visibility_observations`, `entity_consistency_checks` |
| Listings & marketing | `directory_registry`, `directory_eligibility`, `listing_drafts`, `listing_submissions`, `listing_evidence`, `campaigns`, `content_assets`, `social_drafts`, `publishing_tasks` |
| Growth & ops | `outreach_prospects`, `outreach_interactions`, `communities`, `backlinks`, `utm_campaigns`, `analytics_imports`, `traffic_metrics`, `conversion_events`, `growth_experiments`, `referral_programs`, `tasks`, `task_approvals`, `automation_runs`, `generated_reports`, `tool_registry`, `aso_listings`, `local_profiles` |

### Load-bearing columns

- `project_domains.authorized` — the crawl gate. The audit engine reads this
  from the database, never from its caller.
- `brand_profiles.verified_fields_json` — field name to how it was verified.
  Unverified fields block listing approval.
- `brand_profiles.revision` — bumped when a *published-facing* field changes,
  which is what flags downstream listings for update.
- `keyword_opportunities.data_confidence` — `measured`, `provider_estimate` or
  `qualitative_hypothesis`. Carried through clustering into the strategy output.
- `traffic_metrics.data_origin` — `imported`, `manual` or `connected`.
- `listing_evidence.verified` — set only after fetching the page and finding the
  brand name.
- `automation_runs.idempotency_key` — unique index; duplicate job prevention.

### Migrations

Forward-only, numbered, applied in a transaction, recorded in
`schema_migrations`. SQL is deliberately portable: `TEXT`/`INTEGER`/`REAL`, no
SQLite-only expressions.

### PostgreSQL mapping

The schema is written so a Postgres backend is a dialect change, not a rewrite.

| SQLite | PostgreSQL |
| --- | --- |
| `TEXT` primary key | `text` primary key (ids are generated in app code) |
| `INTEGER` boolean (0/1) | `boolean` — change `intOf`/`bool` in `src/core/db/index.ts` |
| `TEXT` ISO timestamp | `timestamptz` — change the mappers |
| `TEXT` JSON column | `jsonb` — the `j.parse`/`j.stringify` helpers already isolate this |
| `ON CONFLICT (a, b) DO UPDATE` | identical syntax |
| `?` placeholders | `$1, $2` — the only driver-level change |

The work is: implement the `Db` interface over `pg`, swap the placeholder style,
and change four helpers. No service module touches SQL dialect directly.

## Request flow: running an audit

1. A server action or CLI command calls `runProjectAudit(db, projectId, opts)`.
2. The service reads `project.websiteUrl` and the **authorized host list** from
   the database.
3. `runAudit` validates the start URL through the SSRF guard, fetches
   `robots.txt` (with one retry), and resolves sitemaps.
4. The crawl loop checks each URL against: authorized hosts, robots.txt rules,
   the page cap, the depth cap, and the per-host throttle.
5. Each response is extracted into `PageFacts`, then `runChecks` produces
   findings from the page set plus site context.
6. Pages, findings, performance results and structured-data results are written
   in one transaction; tasks are generated from findings, de-duplicated by
   `(check_id, page_url)`.

If `robots.txt` is unreachable after a retry, link discovery is disabled for the
run and only the start URL and sitemap URLs are fetched. The result reports
`linkDiscovery: false` so the scope is visible rather than implied.

## Testing boundaries

`tests/audit.test.ts` tests the parser, extractor and check suite against
synthetic pages, with no network. `tests/security.test.ts` tests the SSRF guard
and isolation invariants. `tests/workflow.test.ts` tests service behaviour with
an in-memory database. `tests/e2e.test.ts` crawls `example.com` — reserved by
IANA for exactly this purpose — and is skipped with
`LAUNCHOS_SKIP_NETWORK_TESTS=1`.
