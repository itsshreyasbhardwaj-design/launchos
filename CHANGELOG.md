# Changelog

All notable changes to this project are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-10-29

First release. Everything below was built and verified in this version.

### Added

**Core platform**
- Zero-dependency TypeScript domain layer shared by the CLI and the dashboard.
- 36-table schema on `node:sqlite` with six forward-only migrations and a
  documented PostgreSQL mapping.
- Multi-project management with per-project isolation and cascade deletes.
- Canonical brand profiles with per-field verification tracking and revisioning
  that propagates changes to downstream listings.
- Ten growth presets that change which channels, directories and modules apply.

**Audit engine**
- SSRF-guarded fetch validating every URL and every redirect hop.
- robots.txt parsing with longest-match precedence; a 5xx treated as disallow.
- Sitemap and sitemap-index resolution.
- Dependency-free tolerant HTML scanner that excludes SVG, template and
  noscript subtrees from document metadata.
- Around 30 checks across indexability, metadata, content, structure, structured
  data, internationalization, accessibility and security.
- Framework-aware fix snippets for Next.js, React and static HTML.
- Optional Lighthouse adapter that degrades gracefully when absent.

**SEO and GEO**
- Search Console and Bing CSV import with three-level confidence labelling.
- Intent classification, intent-respecting clustering, content mapping against
  crawled pages.
- Nine-check GEO/AEO audit, AI query library, evidence-gated visibility
  observations, entity consistency checking.
- JSON-LD generation from verified facts only, with omissions explained.
- Optional llms.txt generation with an accurate disclaimer.

**Distribution**
- 39-destination directory registry with eligibility rules and cost
  classification; URL verification separated from operator confirmation.
- Listing preparation, a five-condition approval gate, and evidence-verified
  submission tracking.
- Four launch playbooks with explicit automation boundaries.
- Ten campaign templates and a publishing approval queue.

**Marketing**
- Content briefs separating verified facts from claims needing verification.
- Platform-adapted social drafts across ten channels with hard limits enforced.
- Dependency-free SVG social card generation.
- ASO against documented store field limits; local SEO with GBP eligibility
  assessment; referral planning with a required disclosure.

**Growth and intelligence**
- Ethical outreach requiring a stated contact basis; bulk sending refused.
- Community tracking requiring recorded rules; backlink verification by fetch;
  link schemes rejected by origin.
- Analytics imports labelled by origin, de-duplicating re-imports.
- UTM builder that refuses personal data in parameters.
- Two-proportion z-test with a power check that refuses to call an underpowered
  result significant.
- Explainable readiness scoring and effort-weighted prioritization with no
  fabricated ROI.
- Reports in Markdown, CSV, JSON and PDF, each stating what it cannot claim.

**Interfaces**
- CLI with around 60 commands, all supporting `--json`.
- Next.js dashboard, 28 routes, grouped navigation, light and dark themes,
  responsive from 375px.

**Quality**
- 123 tests including a live end-to-end crawl.
- CI workflow and an opt-in, disabled-by-default scheduled audit workflow.
- 21 documentation files.

### Fixed during development

- SVG `<title>` elements were counted as document titles, producing false
  duplicate-title findings on real sites.
- JSON-LD `@graph` container nodes failed validation for lacking a `@type`.
- `@context` was not inherited into `@graph` children.
- The listing approval gate checked warnings but not missing assets, so a
  listing with no logo or screenshots could be approved.
- UTM personal-data detection missed email-shaped values.
- Search Console imports did not reach the analytics dashboard, so reports said
  no data had been imported after an import.
- A transient robots.txt failure silently disabled robots compliance; it now
  retries once and, failing that, disables link discovery and reports it.

### Known limitations

See [FEATURE_STATUS.md](docs/FEATURE_STATUS.md) and
[COST_LIMITATIONS.md](docs/COST_LIMITATIONS.md). The headline ones: no
JavaScript execution in the crawler, no keyword volume data, no authentication,
and nothing is submitted or published on your behalf.
