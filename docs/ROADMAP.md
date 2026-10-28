# Roadmap

Ordered by how much they would improve the honest usefulness of the tool, not by
how impressive they sound.

## Next

- **Search Console API adapter.** Free with OAuth. Replaces CSV import with a
  live `connected` data origin. The schema already has the value; the work is
  the OAuth flow and token storage done carefully.
- **Browser end-to-end tests.** The service layer is well covered and the
  dashboard was verified by hand, but there is no automated browser suite.
- **Registry growth and periodic verification.** More destinations, more
  operator confirmations, and a scheduled re-verification workflow.
- **Per-page audit history.** Rows exist; a trend view over successive audits
  does not. It would make regressions visible.

## Later

- **PostgreSQL backend.** The dialect mapping is documented and the SQL is
  portable. Needed before any multi-user deployment.
- **Authentication.** Required before hosting. Deliberately absent today rather
  than half-built.
- **Bing Webmaster API adapter.**
- **Internationalization of generated copy.** Listing and social generation is
  English-only; `languages` is recorded but not yet used to vary output.
- **A rendering-aware crawl mode.** Optional, using Playwright if installed, to
  compare served HTML against rendered output. That difference is exactly what
  the thin-content check is guessing at today.

## Explicitly not planned

Anything that submits, posts, sends or solicits on your behalf. Any paid-API
dependency in the core. Any metric LaunchOS cannot evidence — volume,
difficulty, CPC, competitor traffic, projected ROI. Any AI visibility score
presented as a ranking.

These are not backlog items awaiting effort. They are the product boundary.
