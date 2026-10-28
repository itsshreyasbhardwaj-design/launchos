# Search engine discovery

## Google Search Console

Free, needs only a Google account. LaunchOS generates a setup checklist with
your current state filled in.

- **Use a Domain property** (DNS TXT). It covers every subdomain and protocol in
  one place; a URL-prefix property only covers that exact prefix.
- **Verify by DNS.** HTML file and meta tag both break on redeploys.
- **Submit the sitemap.** If your audit found sitemap URLs, they are listed.
- **Index coverage** lives under Pages → Why pages are not indexed.
  "Crawled — currently not indexed" is usually a quality or duplication issue,
  not a technical one.
- **Export query data**, then:
  `launchos seo import Queries.csv --provider google_search_console`

The UI export caps at 1000 rows; the Search Analytics API returns more and is
also free.

**HTTP availability is not index status.** The audit tells you a page responds
200. Only Search Console tells you whether Google indexed it. LaunchOS never
conflates the two.

**The Indexing API is not implemented.** It is documented for job postings and
live-stream structured data. Using it for ordinary pages is a misuse, so
LaunchOS does not offer it.

## Bing Webmaster Tools

Free with a Microsoft account, and it can import your property straight from
Search Console, skipping re-verification. It also generates your IndexNow key
and hosts the key-file instructions. Bing data informs Copilot-facing surfaces,
so it matters more than its search share suggests.

## IndexNow

The one indexing integration that is genuinely free and open, implemented in
full — with four gates before anything is sent:

1. The project must have an **authorized domain**.
2. All URLs must be on **one host** (protocol requirement).
3. That host must be the authorized one.
4. An **IndexNow key must be recorded**, and LaunchOS fetches
   `https://<host>/<key>.txt` and confirms it serves the key before submitting.

Without step 4 every submission is silently rejected, so checking first turns a
mystery into an error message.

On success:

> The notification was accepted. That means the request was well-formed and the
> key checked out. It does **not** mean the URLs were indexed — only Search
> Console or Bing Webmaster Tools can tell you that.

## Discovery checklist

`launchos search-engines checklist` derives ten items from your latest audit and
recorded verification state: HTTPS, crawlability, sitemap, canonical URLs,
indexable content, internal links, Search Console verification, Bing
verification, structured data, and monitoring. Each is `done`, `todo` or
`unknown` — unknown meaning no audit has run, not that it failed.
