# Content engine

## Briefs

A brief is assembled from facts the project already holds. Source material is
split into **verified** and **needs verification**, and the checklist puts the
unverified items first.

The outline shape follows the cluster's intent. Comparison briefs include a
section headed "Which to pick, and when not to pick ours", because naming a case
where you are the wrong choice is what makes the rest of the page credible.
Informational briefs include "Where this approach breaks down" for the same
reason.

Internal link suggestions come from pages the crawl actually found, matched by
token overlap. With no audit data the brief says so rather than inventing links.

### Authenticity rules

LaunchOS will not produce a statistic, a customer count, a testimonial, a case
study result, an award, a certification or a competitor weakness. These are not
filtered after generation — they are never generated, because the generator only
has access to recorded facts.

Every brief ships with a checklist that includes:

- Every factual claim traced to a source in this brief.
- No invented statistics, customer counts, testimonials or awards.
- Screenshots are from the current build.
- Author is named, with their real experience of the topic.

## Content mapping

Clusters are matched against crawled pages before anything is proposed. A
cluster that matches an existing page becomes `optimize_existing` with the URL;
only genuinely uncovered clusters become `create_new`.

This is what stops the doorway-page pattern. You cannot be told to write a page
you already have, and there is no bulk-page generator to abuse.

## Content refresh

Finds published pages that have drifted, from real data:

- Open audit findings on that page.
- Thin content (under 200 words in the HTML response).
- No images on a product page.
- Meta description that never mentions the brand.
- **Measured:** impressions above 100 with zero clicks — the title and
  description are not earning the click. This only appears when search data has
  been imported.
- A URL absent from imported search data entirely, when other URLs are present.

It does not claim a traffic decline without imported data to show it.

## Campaign templates

Ten templates, each with an objective and channels: new SaaS launch, Product
Hunt launch, open-source release, developer tool launch, mobile app launch,
local business launch, feature release, educational content, founder
announcement, SEO content refresh. All customizable; a campaign with neither a
template nor an objective is refused.
