# Costs and limitations

## Completely free, no account

The application, the CLI, the database, audits, all SEO analysis, all GEO
analysis, keyword clustering, content mapping, listing preparation, launch
playbooks, social drafts, SVG asset generation, content briefs, UTM building,
experiment statistics, readiness scoring, prioritization, reports in Markdown,
CSV, JSON and PDF, and the directory and tool registries.

No API key. No subscription. No telemetry.

## Free, but needs a free account

| | Why |
| --- | --- |
| Google Search Console | Your own query, impression and index-coverage data |
| Bing Webmaster Tools | Bing data, and the IndexNow key |
| IndexNow | Needs a key file hosted on your domain |
| Most directory submissions | Account required by the destination |
| GitHub | For Actions, and for a public repository |

## Free locally, optional

**Lighthouse.** `npm i -g lighthouse`, plus a local Chrome. Audits work without
it; with it you get lab metrics.

## Manual by design, not a missing feature

Directory submission, social posting, outreach sending, review requests, AI
visibility observations, marking anything live or published. See
[AUTOMATION.md](AUTOMATION.md) for the reasoning on each.

## Costs money, and is excluded

| | Cost | What LaunchOS does instead |
| --- | --- | --- |
| Apple Developer Program | Annual fee | Prepares the listing copy and checks it against the documented limits |
| Google Play registration | One-time fee | Same |
| Paid SEO platforms | Subscription | Uses your own Search Console data |
| Keyword volume and difficulty data | Subscription | Labels keywords as hypotheses and says so |
| SERP rank tracking | Subscription | Uses Search Console position data |
| Paid directory fast-tracks | Per submission | Marks them `paid_only` and refuses approval |
| AI provider APIs | Per token | Dated manual observations |
| Managed database hosting | Monthly | A SQLite file |
| Paid design generation | Per image | SVG templates |

## What free cannot buy

Honest limits, stated once:

- **Search volume, keyword difficulty and CPC.** No free source gives them
  reliably. You get intent classification, clustering, and your own measured
  impressions.
- **Rank tracking.** Search Console position data is free and is an average over
  a period, not a live rank.
- **Competitor analytics.** Their traffic is not public. LaunchOS does not
  estimate it.
- **Backlink discovery.** Index-based discovery needs a crawl at a scale that
  costs real money. LaunchOS verifies links you know about; it cannot find ones
  you do not.
- **AI answer monitoring at scale.** Dated manual observations are what is
  available without a paid key, and they are honest about being samples.
- **Guaranteed anything.** No ranking, no AI citation, no directory acceptance,
  no coverage, no traffic, no revenue. Nothing promises these; the ones that
  imply it are selling something.

## Free-tier volatility

A free tier today may not be free next year. This is why:

- The directory registry tracks verification state and dates.
- `freeSubmission: 'unknown'` is the default for anything uncertain.
- Tool entries record their free limits and start unverified.
- Every optional integration degrades rather than breaks.

Re-run `launchos directories verify` periodically, and confirm anything you are
about to spend effort on.
