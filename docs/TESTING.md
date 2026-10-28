# Testing

```bash
npm test                               # 123 tests
LAUNCHOS_SKIP_NETWORK_TESTS=1 npm test # skip the live-network end-to-end test
npm run lint                           # tsc --noEmit over the app
npx tsc -p tsconfig.core.json --noEmit # type-check the core and CLI
```

Vitest, Node environment, in-memory SQLite per test.

## Coverage

| File | Tests | Covers |
| --- | --- | --- |
| `tests/audit.test.ts` | 37 | HTML scanner, page extraction, every check family, structured-data validation, robots.txt parsing and precedence, framework-aware fixes |
| `tests/security.test.ts` | 17 | SSRF guard across IPv4/IPv6 ranges and schemes, crawl authorization, project isolation, cascade deletes, UTM personal-data rejection, IndexNow preconditions |
| `tests/workflow.test.ts` | 68 | Registry honesty, directory matching and eligibility gates, the full listing lifecycle, SEO clustering and confidence labelling, GEO refusals, social adaptation and limits, approval boundaries, analytics and statistics, ASO limits, readiness, reporting, PDF structure |
| `tests/e2e.test.ts` | 1 | The complete 24-step workflow against a real crawl of `example.com`, plus second-project isolation |

## What the tests assert about honesty

These are the ones that matter most, because they are what stop the product
drifting back into the thing it was built not to be:

- A listing cannot be approved with warnings or missing assets.
- A listing is not marked live without verified evidence.
- A social draft cannot be marked published without a URL.
- Structured data never contains `aggregateRating` or `review`.
- An `Offer` is omitted unless the price is unambiguous.
- `LocalBusiness` is omitted without a real recorded address.
- Keyword rows never carry a volume the import did not contain.
- An underpowered experiment is not called significant at *p* < 0.05.
- Prioritization output contains no traffic, conversion or revenue estimate.
- Reports state what they cannot claim.
- Bulk outreach is refused outright.
- Link-scheme origins are rejected.
- A community cannot be recorded without its real rules.
- A prospect cannot be added without a stated contact basis.
- Re-importing the same export does not double-count.

## Bugs the tests caught during development

Written down because it is the honest record of how the code got here:

1. **SVG `<title>` counted as a document title** — real Next.js sites produced
   false `title.duplicate_tag` findings. Fixed with ancestor tracking in the
   scanner.
2. **JSON-LD `@graph` containers failed validation** — a wrapper node with no
   `@type` is correct and common. Fixed by treating it as a container.
3. **`@context` not inherited into `@graph` children** — inner nodes were
   reported as missing a context they legitimately inherit.
4. **The listing approval gate ignored missing assets** — `prepareListing` set
   status `eligibility_confirmed` for missing assets but `approveListing` only
   checked warnings, so a listing with no logo or screenshots could be approved.
5. **UTM personal-data detection missed `user@example.com`** — keyword matching
   alone was not enough. Replaced with structural heuristics.
6. **Search Console imports did not reach the analytics dashboard** — two
   separate stores meant a weekly report said "no search data imported" after an
   import. Unified, with de-duplication.
7. **`robots.txt` network blips disabled robots compliance silently** — now one
   retry, and if it still fails, link discovery is disabled and reported.

## Manual verification performed

- The audit engine was run against `example.com` and `nodejs.org`; extraction,
  framework detection (Next.js), sitemap resolution (1754 URLs) and findings
  were checked by hand against the real pages.
- The full CLI workflow was walked end to end.
- The dashboard was driven in a real browser: a server action was submitted, the
  database write and the live badge update were confirmed, the console was
  checked for errors, and the layout was verified at 375px and desktop width.

## Not covered

- Playwright browser-level end-to-end tests of the dashboard. The server actions
  are covered through the service layer, and the UI was verified manually, but
  there is no automated browser suite.
- Visual regression testing.
- Load testing. It is a local single-user tool.
