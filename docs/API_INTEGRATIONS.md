# API integrations

## Implemented

**IndexNow.** Fully implemented and genuinely free. Four preconditions are
enforced before any request: an authorized domain, a single host, a recorded
key, and a live key file that LaunchOS fetches and verifies. A successful
response is reported as "accepted", never as "indexed".

## Optional local adapters

**Lighthouse.** Detected on `PATH` at audit time. If present, LaunchOS runs it
headless and records lab metrics with an explicit note that lab data is not
field data and that Lighthouse scores are not a ranking factor. If absent,
audits run normally and the note says so. LaunchOS never installs it for you.

**Playwright.** Listed in the tool registry for screenshot capture. Not a
dependency.

## Deliberately not implemented

| | Why |
| --- | --- |
| **Google Indexing API** | Documented for job postings and live-stream structured data. Using it for ordinary pages is a misuse |
| **Any AI provider API** | Needs a paid key. The no-cost constraint is not negotiable, and a single sampled answer is not reproducible evidence anyway |
| **Directory submission APIs** | None of the 39 destinations offers an authorized third-party submission API |
| **Social publishing APIs** | Where one exists it is account-scoped and terms-bound; LaunchOS does not publish |
| **Paid SEO platform APIs** | Ahrefs, Semrush and similar. Their data is good and it costs money |
| **SERP scraping** | Against the terms of every major engine |

## Planned, behind explicit authorization

**Google Search Console API.** Free with OAuth, and would replace CSV import
with a live `connected` data origin. The `provider_estimate` and `connected`
values already exist in the schema. The work is the OAuth flow and token
storage, which needs doing carefully given what else is in the database.

**Bing Webmaster Tools API.** Same shape, free with an API key.

Both would be optional. Absence of a connected integration must never disable
the CSV path, which is why the CSV path was built first.

## Adding one

The pattern is a `provider_adapter` in `src/core/services/`:

1. Never require it. The feature must work without it.
2. Mark the data origin `connected`, not `imported` or `manual`.
3. Report provider failures rather than falling back to a guess.
4. Document the free tier limits in `src/core/data/tools.ts`.
5. Never store a credential in the database — environment or OS keychain only.
