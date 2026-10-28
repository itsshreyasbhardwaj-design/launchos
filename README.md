# LaunchOS

**Build it. Launch it. Get discovered.**

A free, open-source post-launch growth operating system. It takes a product that
already exists and walks it through the unglamorous work that actually makes it
findable: technical SEO, generative-engine readiness, directory listings, launch
preparation, content, social, ethical outreach, analytics and conversion.

It runs entirely on your own machine. There is no account, no subscription, no
AI API key, and no paid tier. The database is a file.

```bash
git clone https://github.com/itsshreyasbhardwaj-design/launchos.git && cd launchos
npm install
npm run build:core          # compiles the shared core for the CLI
node bin/launchos.mjs init  # creates data/launchos.db and seeds the registries
npm run dev                 # dashboard on http://localhost:3211
```

---

## What makes it different

Most growth tooling is confident. LaunchOS is accurate, which is less flattering
and considerably more useful.

| It will | It will not |
| --- | --- |
| Crawl a site you have explicitly authorized and report findings with the evidence attached | Crawl anything else, including private network addresses |
| Say "6 of 16 keywords carry measured data; the rest are hypotheses" | Report a search volume, keyword difficulty or CPC it does not have |
| Prepare listing copy from facts you recorded and verified | Invent a price, a feature or a tagline to fill a field |
| Mark a listing live after fetching the page and finding your brand name on it | Take your word that something was published |
| Tell you an A/B result is underpowered even when *p* < 0.05 | Call noise a win |
| Generate `Organization` and `SoftwareApplication` JSON-LD from verified facts | Generate `aggregateRating` or `review` markup, ever |
| Tell you an online-only SaaS is not eligible for a Google Business Profile | Suggest a workaround |
| Draft one outreach message for one prospect you have a stated reason to contact | Send it, or send anything in bulk |
| Prepare a Product Hunt launch kit | Ask for, buy or coordinate upvotes |
| Show you a metric when rows exist for it | Render a zero that looks like a measurement |

That last column is the product. Everything in it is enforced in code and
covered by tests, not written in a policy document and hoped for.

---

## Main features

**Website audit engine.** A real crawler with an SSRF guard on every URL and
every redirect hop, per-host rate limiting, robots.txt compliance (longest-match
`Allow`/`Disallow`, and a 5xx treated as *disallow*, not as permission), and page
and depth caps. Around 30 checks across indexability, metadata, content,
structure, structured data, internationalization, accessibility and security.
Every finding carries evidence, an impact hypothesis, a fix, a verification
method and, where applicable, a framework-specific code snippet.

**SEO Studio.** Imports your Search Console or Bing CSV exports; clusters
keywords by token overlap within a single intent; maps clusters onto pages the
crawl actually found, so "create new" means new; generates tasks from real
findings.

**GEO / AEO Studio.** Nine checks on whether your site states its own facts in a
form an answer engine can extract — server-rendered text, public pricing, FAQ
shape, entity structured data, naming consistency, AI-crawler policy. An AI
search query library you run yourself, with dated, sourced observations. Entity
consistency checking across the public records you control. JSON-LD generation
from verified facts only.

**Directory engine.** 39 real destinations with eligibility rules, geography,
cost classification and per-platform field limits. Matching that refuses a
launch platform while you are pre-launch and refuses a Google Business Profile
for an online-only product. Listing preparation, an approval gate that blocks on
warnings and missing assets, and evidence-verified submission tracking.

**Launch Center.** Product Hunt, Show HN, GitHub release and community
playbooks, each with a readiness check against real evidence and an explicit
automation boundary. The Show HN playbook deliberately refuses to write your
post.

**Content and Social Studios.** Briefs that separate verified facts from claims
needing verification. Platform-adapted drafts for ten channels — never the same
text twice — with hard character limits enforced and dependency-free SVG social
cards.

**Growth.** Ethical outreach with a required basis for every contact, community
tracking that will not record a community without its real rules, backlink
tracking that verifies the link is on the page, and link schemes rejected by the
origin field.

**Analytics.** CSV imports labelled by origin, a UTM builder that refuses
personal data in parameters, a two-proportion z-test with a power check, and a
dashboard that shows nothing where nothing was measured.

**Reports.** Daily, weekly and monthly, in Markdown, CSV, JSON or PDF — the PDF
writer is 60 lines and has no dependency. Every report ends with what it cannot
claim.

**CLI.** Around 60 commands over the exact same services as the dashboard, with
`--json` on everything.

---

## Architecture in one paragraph

`src/core/` is a dependency-free TypeScript domain layer: database, crawler,
parser, check suite, and one service module per growth area. The Next.js
dashboard imports it directly; the CLI imports a compiled copy from `dist/`.
There is exactly one implementation of every rule, so the approval gate that
blocks a listing in the terminal blocks it in the browser too. Persistence is
`node:sqlite`, which ships inside Node 22.5+ — no native build step, no database
service. See [ARCHITECTURE.md](docs/ARCHITECTURE.md).

```
src/core/        domain layer — no React, no Next.js, no runtime dependencies
  db/            connection, versioned migrations (36 tables)
  net/           SSRF-guarded fetch, robots.txt, sitemaps, host throttle
  html/          tolerant HTML scanner
  audit/         extraction, ~30 checks, schema validation, fix generation
  services/      projects, seo, geo, listings, launch, social, content,
                 outreach, analytics, readiness, reports, channels
  data/          directory and free-tool registries
src/cli/         terminal interface over the same services
src/app/         Next.js dashboard, 28 routes, server actions
tests/           123 tests
```

---

## Free-first, and what that actually means

Nothing in LaunchOS requires payment. `.env.example` exists, and every variable
in it is optional.

| Completely free | Needs a free account | Manual by design | Costs money (and is excluded) |
| --- | --- | --- | --- |
| The whole application | Google Search Console | Every directory submission | Apple Developer Program |
| Audits, SEO, GEO, reports | Bing Webmaster Tools | Every social post | Google Play registration |
| CLI and dashboard | IndexNow key hosting | All outreach | Paid SEO platforms |
| SQLite storage | GitHub (for Actions) | AI visibility observations | Paid directory fast-tracks |

Optional integrations degrade rather than break: Lighthouse is used if it is
installed locally and politely skipped if not. See
[COST_LIMITATIONS.md](docs/COST_LIMITATIONS.md).

---

## Security boundaries

- **Crawl authorization.** The audit engine reads the authorized-host list from
  the database, never from the caller, so a crafted web request cannot widen the
  scope.
- **SSRF.** Every URL and every redirect hop is checked against loopback,
  private, link-local, CGNAT, multicast and reserved ranges in both IPv4 and
  IPv6, plus internal-looking hostnames, non-HTTP schemes and embedded credentials.
- **Project isolation.** Every query is project-scoped; deletes cascade.
- **No secrets in the repo.** `data/`, `*.db`, `.env*` and `reports/` are
  gitignored. Private project records cannot be committed by accident.
- **Approval gates.** Listings, social posts, publishing tasks and outreach all
  require a named human approval before they can move forward.

See [SECURITY.md](SECURITY.md) and [PRIVACY.md](docs/PRIVACY.md).

---

## Screenshots

Run `npm run dev` and visit `http://localhost:3211`. The Command Center, GEO
Studio and Directory engine are the three screens worth seeing first. Screenshots
are deliberately not committed to this README until they are taken from a real
install with real data — a placeholder would be exactly the kind of thing this
project exists to avoid.

---

## Documentation

| | |
| --- | --- |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Layers, data model, PostgreSQL mapping |
| [PROJECT_SETUP.md](docs/PROJECT_SETUP.md) | Install, first project, first audit |
| [SEO_ENGINE.md](docs/SEO_ENGINE.md) | Every check, and what the crawler cannot see |
| [GEO_ENGINE.md](docs/GEO_ENGINE.md) | What GEO means here, and what it refuses to claim |
| [DIRECTORY_ENGINE.md](docs/DIRECTORY_ENGINE.md) | Registry, verification states, eligibility |
| [SEARCH_INDEXING.md](docs/SEARCH_INDEXING.md) | Search Console, Bing, IndexNow |
| [CONTENT_ENGINE.md](docs/CONTENT_ENGINE.md) | Briefs, refresh, authenticity rules |
| [SOCIAL_MARKETING.md](docs/SOCIAL_MARKETING.md) | Platform adaptation and publishing rules |
| [LAUNCH_WORKFLOWS.md](docs/LAUNCH_WORKFLOWS.md) | Playbooks and their boundaries |
| [ANALYTICS.md](docs/ANALYTICS.md) | Data origins, attribution limits, statistics |
| [AUTOMATION.md](docs/AUTOMATION.md) | What is automated and what never will be |
| [GITHUB_ACTIONS.md](docs/GITHUB_ACTIONS.md) | Workflows and free-minute budgeting |
| [SECURITY.md](SECURITY.md) | Threat model and reporting |
| [PRIVACY.md](docs/PRIVACY.md) | What is stored and what leaves the machine |
| [FREE_TOOLS.md](docs/FREE_TOOLS.md) | The curated registry |
| [API_INTEGRATIONS.md](docs/API_INTEGRATIONS.md) | Supported, planned and refused |
| [TESTING.md](docs/TESTING.md) | Test strategy and coverage |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Local, self-hosted, and what to add first |
| [ROADMAP.md](docs/ROADMAP.md) | What is next |
| [FEATURE_STATUS.md](docs/FEATURE_STATUS.md) | Honest per-feature status |
| [COST_LIMITATIONS.md](docs/COST_LIMITATIONS.md) | What free cannot buy |

---

## Limitations

Stated plainly, because the alternative is discovering them later:

- The crawler reads the HTML response and **does not execute JavaScript**. A
  client-rendered page looks thin to it — which is the point, because it looks
  thin to several AI crawlers too, but it means word counts for SPAs are about
  the served HTML, not the rendered page.
- The HTML scanner is tolerant, not a spec-compliant HTML5 tree builder.
- Keyword volume, difficulty and CPC are **not available**. No free source gives
  them reliably, so LaunchOS does not show them.
- AI visibility is **observational only**. Generative answers vary by account,
  region, model version and phrasing.
- The directory registry is seed data. URLs can be checked automatically;
  whether submission is free needs a human.
- Nothing is submitted or published for you. None of these destinations offers
  an authorized submission API that LaunchOS can use on your behalf.
- There is **no authentication**. It is built to run on your own machine. Put a
  proxy with auth in front of it before hosting it anywhere.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The one rule that matters: a feature
that reports a number LaunchOS cannot evidence will not be merged.

## Licence

Apache 2.0. See [LICENSE](LICENSE).
