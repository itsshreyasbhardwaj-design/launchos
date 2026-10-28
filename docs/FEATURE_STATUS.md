# Feature status

Honest per-feature status. **Verified** means exercised by an automated test or
checked by hand against real output during development.

## Completed and verified

| Feature | Verified by |
| --- | --- |
| Multi-project management and isolation | `security.test.ts`, `e2e.test.ts` |
| Canonical brand profile, verification tracking, revisioning | `workflow.test.ts`, CLI walkthrough |
| Marketing asset recording | `workflow.test.ts`, listing gate |
| Domain registration and crawl authorization | `security.test.ts` |
| SSRF-guarded fetch, redirect re-validation | `security.test.ts` (14 blocked ranges) |
| robots.txt parsing, precedence, 5xx handling | `audit.test.ts` |
| Sitemap and sitemap-index resolution | Live run: 1754 URLs from nodejs.org |
| Tolerant HTML scanner | `audit.test.ts` (7 cases including SVG exclusion) |
| Page extraction | `audit.test.ts`, live runs |
| ~30 technical SEO checks with evidence | `audit.test.ts` |
| Structured-data validation | `audit.test.ts` (6 cases) |
| Framework-aware fix snippets | `audit.test.ts` |
| Audit persistence and task generation | `e2e.test.ts` |
| Search Console / Bing CSV import | `workflow.test.ts` (BOM, CRLF, quotes) |
| Keyword confidence labelling | `workflow.test.ts` |
| Intent classification and clustering | `workflow.test.ts` |
| Content mapping against crawled pages | `workflow.test.ts` |
| SEO strategy with caveats | `workflow.test.ts` |
| GEO audit, 9 checks | `e2e.test.ts` |
| AI query library | `workflow.test.ts` |
| AI visibility observations with evidence gate | `workflow.test.ts` |
| Entity consistency checking | CLI walkthrough |
| JSON-LD generation and omissions | `workflow.test.ts` (4 cases) |
| llms.txt with disclaimer | `workflow.test.ts` |
| Directory registry, 39 destinations | `workflow.test.ts` |
| Registry URL verification | CLI walkthrough |
| Directory matching and eligibility gates | `workflow.test.ts` (5 cases) |
| Listing preparation and limits | `workflow.test.ts` |
| Approval gate | `workflow.test.ts` (4 cases) |
| Submission and evidence verification | `e2e.test.ts` |
| Change propagation | `workflow.test.ts` |
| Launch playbooks (4) | `workflow.test.ts`, `e2e.test.ts` |
| Launch scheduling | `e2e.test.ts` |
| Campaigns and 10 templates | `workflow.test.ts` |
| Publishing approval tasks | `workflow.test.ts` |
| Content briefs | `workflow.test.ts` |
| Content refresh | CLI walkthrough |
| Social drafts, 10 platforms | `workflow.test.ts` (3 cases) |
| Publishing evidence gate | `workflow.test.ts` |
| SVG social cards | `workflow.test.ts` (2 cases) |
| Outreach with contact basis | `workflow.test.ts` |
| Bulk-send refusal | `workflow.test.ts` |
| Community rules gate | `workflow.test.ts` |
| Backlink tracking and link-scheme rejection | `workflow.test.ts` |
| Backlink verification | CLI implementation |
| Analytics import and origins | `workflow.test.ts` |
| Double-count prevention | `workflow.test.ts` |
| UTM builder and personal-data refusal | `security.test.ts` |
| Experiment statistics and power check | `workflow.test.ts` (4 cases) |
| ASO with documented store limits | `workflow.test.ts` |
| Local SEO and GBP eligibility | `workflow.test.ts` |
| Referral planning with disclosure gate | Service implementation |
| CRO review from crawl evidence | Service implementation |
| Readiness scoring | `workflow.test.ts` |
| Prioritization without fabricated ROI | `workflow.test.ts` |
| Reports, 3 periods, 4 formats | `workflow.test.ts` |
| Dependency-free PDF writer | `workflow.test.ts` (structure assertion) |
| Project export and cascade delete | `security.test.ts` |
| CLI, ~60 commands | Full walkthrough |
| Dashboard, 28 routes | Production build + browser verification |
| Server actions | Browser verification of a real mutation |

## Implemented but unverified by automated test

| Feature | Note |
| --- | --- |
| Lighthouse adapter | Lighthouse is not installed on the development machine, so the absent path is what was exercised. The present path is implemented and would need a machine with Chrome |
| IndexNow submission | All four preconditions are tested. The final POST was never sent, because that requires a domain with a live key file |
| Entity consistency live fetching | Exercised via CLI; no automated test (it needs network) |
| Backlink verification live fetching | Same |
| Registry URL verification | Same |
| Content refresh | Exercised via CLI; no automated test |
| CRO landing-page review | Exercised via CLI; no automated test |
| Referral programme generation | No test |
| PDF rendering fidelity | Structure is asserted; the output was not opened in a PDF reader |

## Partially implemented

| Feature | What is missing |
| --- | --- |
| Localization | `languages` is recorded but generated copy is English-only |
| Audit history trends | Rows are kept per audit; there is no trend view |
| Campaign outcome tracking | `setCampaignOutcome` exists in the core but has no UI control |
| Referral tracking | Planning and landing copy only; no conversion attribution |
| `project_integrations` table | Schema exists; no integration uses it yet |

## Not implemented

Authentication. PostgreSQL backend. Any AI provider integration. Any
submission or publishing automation. Search Console / Bing API adapters.
Browser end-to-end tests. Docker. Rank tracking, competitor analytics, backlink
discovery.

## Blocked

| | Blocked by |
| --- | --- |
| Live directory submission | No destination offers an authorized third-party API |
| AI answer monitoring at scale | Needs a paid API key |
| Keyword volume and difficulty | No reliable free source |
| Competitor traffic | Not public data |
| App store publication | Paid developer accounts |
