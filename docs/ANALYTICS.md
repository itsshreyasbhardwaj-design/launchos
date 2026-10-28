# Analytics

## Data origins

Every stored metric carries one:

| Origin | Means |
| --- | --- |
| `imported` | From a CSV export you uploaded |
| `manual` | Typed in by you |
| `connected` | From a live authorized API |

Nothing is synthesised. The dashboard shows a metric only where rows exist for
it; where they do not, it says so rather than rendering a zero that reads like a
measurement.

## Imports

Search Console and Bing query exports, and any CSV with recognisable columns.
The reader handles a UTF-8 BOM, CRLF line endings and quoted fields containing
commas — all three appear in real Search Console exports.

Column detection is fuzzy over normalized names, so `Top queries`, `Query` and
`query` all work. The import reports which columns it detected, so a wrong guess
is visible rather than silent.

A query export writes to both `keyword_opportunities` (for SEO workflows) and
`traffic_metrics` (for the dashboard), and clears prior rows from the same
provider and dimension first — so re-importing the same export does not
double-count. A test asserts this.

## Attribution

The UTM builder:

- Normalizes parameters to URL-safe lowercase hyphenated values and reports what
  it changed.
- Preserves existing query parameters on the destination URL.
- **Refuses personal data.** Not only keyword matching: a value containing `@`,
  a run of seven or more digits, or a government-identifier pattern is rejected
  with the reason. Campaign parameters end up in analytics, logs, referrer
  headers and shared links.

Every generated URL carries:

> UTM attribution only shows the last tagged click. It does not prove that this
> channel caused a conversion.

LaunchOS does not build a multi-touch attribution model, because doing it
honestly needs data it does not have.

## Experiments

A two-proportion z-test on real counts, with a normal CDF approximation
(Abramowitz & Stegun 7.1.26).

It also computes the sample size per group needed to detect the observed effect
at 80% power and α = 0.05. **If the test is underpowered, LaunchOS refuses to
call it significant even when *p* < 0.05:**

> p=0.019 crosses 0.05, but each group would need about 59 observations to
> detect an effect this size with 80% power, and you have 40 and 42. LaunchOS
> does not call this significant — an underpowered result that crosses the
> threshold is usually noise.

Edge cases: an empty group returns "Not analysable" rather than dividing by
zero; conversions exceeding the sample size are rejected.

## Privacy-aware alternatives

Microsoft Clarity is in the tool registry with a privacy note, but LaunchOS
never wires it in. Session recording captures real visitor behaviour, so whether
it is appropriate depends on your audience, your privacy policy and the
provider's terms. Umami, GoatCounter and self-hosted options are listed as
alternatives that keep visitor data on your own infrastructure.
