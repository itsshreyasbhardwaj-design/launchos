# SEO engine

## What the crawler is

A polite, bounded crawler that reads HTTP responses. It is not a browser.

- **No JavaScript execution.** It reads the HTML your server returned. If your
  content only exists after hydration, the crawler reports a thin page — and
  says explicitly that this may mean client-side rendering rather than thin
  content, because the distinction matters and it cannot tell them apart.
- **Tolerant HTML scanning.** A hand-written scanner handles unclosed tags,
  unquoted attributes and raw `<script>` bodies. `<title>` and `<h1>` inside
  inline SVG, `<template>` or `<noscript>` are excluded from document metadata —
  an SVG icon label is not your page title.
- **Honours robots.txt.** Longest-match `Allow`/`Disallow` with wildcard and
  `$` support, and the most specific matching user-agent group wins. A 5xx from
  robots.txt is treated as *disallow*, never as permission.
- **Bounded.** Page cap (default 40, env-overridable), depth cap, response size
  cap, redirect cap, per-request timeout and a per-host throttle that serializes
  requests and spaces them out.
- **Safe.** Every URL and every redirect hop goes through the SSRF guard.

## Checks

### Indexability
| Check | Severity | Triggers when |
| --- | --- | --- |
| `http.error` | critical / high | Status ≥ 400 (5xx is critical) |
| `https.missing` | critical | Final URL is not HTTPS |
| `indexability.noindex` | high | `noindex` in meta robots or `X-Robots-Tag` |
| `indexability.robots_blocked` | high | Path matches a `Disallow` for `*` |
| `sitemap.missing` | high | No readable sitemap found |
| `sitemap.empty` / `sitemap.error` | medium | Empty `<urlset>` or a declared sitemap that failed |
| `canonical.missing` | medium | No `<link rel="canonical">` |
| `canonical.mismatch` | medium | Canonical points elsewhere on the same host |
| `redirect.chain` | medium | Two or more redirect hops |
| `robots.unreachable` | medium | `/robots.txt` did not respond after a retry |
| `robots.missing` | low | 404 — crawling is allowed, but the sitemap has no declared home |

### Metadata
`title.missing` (high), `title.duplicate_tag`, `title.duplicate`,
`description.duplicate` (medium), `description.missing` (medium),
`title.length`, `description.length`, `og.missing` (low), `twitter.missing` (info).

Title length flags under 15 or over 65 characters; Google truncates at roughly
580px, about 60 characters. Description targets 120–155.

### Content and structure
`content.thin` (under 120 words in the HTML response), `h1.missing`,
`h1.multiple`, `links.no_internal`, `links.broken_internal`,
`links.not_crawlable` (`javascript:` URLs), `structure.orphan_candidates`.

The orphan check states its own scope in the evidence — "3 page(s) crawled of 40
requested" — because a page linked only from an uncrawled page would otherwise
look like a false orphan.

### Structured data
`structured_data.invalid_json`, `structured_data.incomplete`, and
`structured_data.unsupported_claim` (high) — markup asserting a price, rating or
address that does not appear in the visible page text. That is a Google
structured-data policy violation, and it is also simply false.

The validator checks required and recommended properties per type, inherits
`@context` into `@graph` children, and treats a `@graph` wrapper without a
`@type` as a container rather than an error.

### Accessibility and internationalization
`image.alt`, `headings.skipped_level`, `lang.missing`,
`hreflang.no_self_reference`.

## Every finding carries

| Field | Why |
| --- | --- |
| `evidence` | The actual observation. Not "your title is bad" — the title, and its length |
| `impactHypothesis` | Why it matters, stated as a hypothesis, not a promise |
| `suggestion` | What to do |
| `complexity` | trivial / small / medium / large |
| `verification` | How to confirm it is fixed, independently of LaunchOS |
| `docsUrl` | Primary documentation, usually Google's |
| `fixSnippet` | Framework-aware: Next.js App Router metadata, React head manager, or plain HTML |

Framework detection reads `/_next/static`, `__NEXT_DATA__`, `x-powered-by` and
React markers, so a Next.js project gets `export const metadata` rather than a
`<link>` tag it cannot use.

## Keywords

Three confidence levels, carried end to end:

- **`measured`** — from your own Search Console or Bing CSV export. Real
  impressions, clicks, CTR and position.
- **`provider_estimate`** — reserved for an authorized provider API.
- **`qualitative_hypothesis`** — operator-supplied or derived from your own page
  titles, headings and recorded features. No metrics attached.

**LaunchOS does not report search volume, keyword difficulty or CPC.** No free
source provides them reliably. A plausible invented number is worse than a blank
field, because it silently reorders your entire plan.

## Clustering

Agglomerative single-link clustering on Jaccard similarity of content tokens,
with a default threshold of 0.34. Keywords of different intent are **never**
merged: "pricing" and "how to" belong on different pages even when they share
words. Each cluster states whether it has measured demand behind it.

Page type is chosen from the intent plus every member keyword, so a cluster
labelled "alternatives jira triage" becomes a comparison page even though the
label itself does not contain the singular "alternative".

## Content mapping

Each cluster is matched against pages the crawl actually found, by token overlap
of title and URL path. Above 30% overlap it is `optimize_existing` with the URL;
below, `create_new`. With no audit data it says coverage is unknown rather than
recommending new pages blind.

This is the check that stops the doorway-page pattern: you cannot be told to
create a page that already exists.
