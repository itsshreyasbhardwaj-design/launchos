# Automation

## What is automated

- **Crawling and analysis.** Audits, checks, structured-data validation, GEO
  analysis, clustering, content mapping, prioritization, report assembly.
- **Content preparation.** Listing copy, social drafts, briefs, JSON-LD, SVG
  cards, store listings, launch checklists.
- **Verification.** Registry URL checks, backlink presence checks, listing
  evidence checks, IndexNow key-file checks.
- **Bookkeeping.** Task generation from findings, change propagation to stale
  listings, the audit event log.

## What is never automated

| | Why |
| --- | --- |
| Directory submission | No destination offers an authorized third-party submission API |
| Social posting | Same, plus platform terms |
| Outreach sending | Unsolicited bulk messaging is spam; single messages are yours to send |
| Account creation | Every account is yours |
| Marking something live or published | That needs evidence, not an assumption |
| Review solicitation | Platform-dependent, and Yelp prohibits it outright |
| Anything that touches votes or engagement | Vote manipulation is a ban-level offence |
| CAPTCHA, authentication or anti-spam bypass | Not implemented, not accepted as a feature request |

## Approval gates

Four, all enforced in the core so they apply equally to the CLI and the dashboard:

1. **Listing approval** — named approver, zero warnings, zero MISSING assets,
   correct status, eligible.
2. **Social publishing** — a URL to the live post, or the record is refused.
3. **Publishing tasks** — a named approver moves `awaiting_approval` to
   `approved_for_manual_action`. There is no state past that.
4. **Outbound outreach** — an approver name, or the interaction is not logged.

## Rate limiting and safety

- `HostThrottle` serializes requests to one host and spaces them by
  `LAUNCHOS_CRAWL_DELAY_MS` (default 750ms).
- Page cap, depth cap, response size cap, redirect cap, request timeout.
- Registry verification adds its own 400ms gap; backlink verification 500ms.
- `automation_runs.idempotency_key` has a unique index, so a duplicate job
  insert fails rather than running twice.

## Scheduled runs

See [GITHUB_ACTIONS.md](GITHUB_ACTIONS.md). The shipped workflows run tests and
build, plus an **opt-in** weekly audit that is disabled by default. Scheduling
an audit of your own site against your own authorized domain is safe; scheduling
anything that publishes is not, which is why no such workflow exists.
