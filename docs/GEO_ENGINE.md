# GEO and AEO engine

**GEO** — Generative Engine Optimization. **AEO** — Answer Engine Optimization.

## What this is

A measurement of your own site: whether it states, in crawlable text, the things
an answer engine would need in order to describe or recommend it accurately.
Plus a record of what AI assistants actually said, when you checked.

## What this is not

It does not predict AI rankings. It does not model any provider's retrieval or
ranking. It does not scrape AI interfaces or bypass provider restrictions. It
does not promise inclusion in an AI answer, because nobody can.

If you came here looking for an AI visibility score that goes up when you buy
something, LaunchOS does not have one and will not grow one.

## The nine checks

| Check | Requirement | Why it is measurable |
| --- | --- | --- |
| `identity.brand_in_metadata` | Brand name appears in titles or descriptions | Answer engines extract entity names from crawlable metadata |
| `identity.explainer_page` | A page explains what the product is and who it is for | Generative engines quote explanatory prose; without it they describe from inference |
| `extractability.server_rendered_text` | Content is in the HTML response, not only after JS | Many AI crawlers do not execute JavaScript |
| `facts.public_pricing` | Pricing is stated on a public page | "How much does X cost" is among the most common assistant prompts |
| `answers.faq_content` | Questions are answered in question-and-answer form | Question headings with a direct answer underneath are the most extractable format there is |
| `facts.entity_structured_data` | Organization / SoftwareApplication / LocalBusiness JSON-LD | Makes your facts machine-readable instead of inferred |
| `trust.supporting_evidence` | Important claims link to something checkable | Unsupported superlatives are discounted by readers and assistants alike |
| `identity.consistent_naming` | One spelling everywhere | Spelling drift splits one entity into two records |
| `access.ai_crawler_policy` | Your robots.txt policy for AI agents is deliberate | Blocking AI crawlers is legitimate; it is just incompatible with wanting to be cited |

Each returns `pass`, `fail` or `unknown`, with the evidence, the reason and the
fix. `unknown` means a missing input, not a failure.

## AI visibility tracking

LaunchOS does **not** query AI providers. That would need a paid API key (which
the no-cost constraint rules out), and a single sampled answer is not
reproducible anyway.

Instead: it generates a query library from your recorded facts — "best `<category>`
for `<audience>`", "alternatives to `<brand>`", "is `<brand>` free" — each with a
rationale for why that phrasing matters. You run them yourself and record what
you saw.

Every observation requires a provider, a query, a date, and evidence. Evidence
of kind `screenshot`, `transcript` or `url` **must** carry a reference; only a
bare `note` may stand alone. Every recorded observation returns this caveat:

> Generative answers vary by account, region, model version and phrasing, so
> this is evidence of one result at one moment, not a measurable ranking.

## Entity consistency

Fetches only the URLs recorded on your brand profile — your site, your
repository, your social profiles — and checks whether your canonical brand name,
tagline and website appear on each. Mismatches are reported with both values.
LaunchOS never edits a third-party record.

## Structured data generation

Built from verified brand facts only.

**Always generated when the facts exist:** `Organization`, `WebSite`,
`SoftwareApplication` / `MobileApplication`, `LocalBusiness` (only with a real
recorded address).

**Never generated:** `aggregateRating`, `review`. Rating markup must come from
real, verifiable reviews displayed on the page. There is no flag to turn this on.

**Conditionally omitted:** an `Offer` is emitted with `price: "0"` only for a
genuinely free product. If pricing detail contains numbers, LaunchOS refuses to
parse a price into markup and tells you to add the `Offer` by hand so the figure
matches your pricing page exactly. Everything omitted is listed with its reason.

## llms.txt

Generated if you want it, with this attached:

> llms.txt is an experimental proposal, not a standard any major provider
> requires. Publishing it is harmless and occasionally useful, but it will not
> get you into AI Overviews or AI Mode. Fix crawlability, server-rendered text
> and factual accuracy first — those are what actually determine whether your
> content can be used.

