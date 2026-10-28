# Privacy

## What LaunchOS stores

Everything is in one SQLite file, by default `data/launchos.db`, which is
gitignored.

Project records, canonical brand facts, crawl results from your own sites,
keyword and analytics data you imported, listing drafts and submission evidence,
outreach prospects and the stated basis for each contact, campaign and content
records, AI visibility observations, and an audit event log.

## What leaves your machine

Only on an action you take:

| Action | Request |
| --- | --- |
| Run an audit | HTTP requests to hosts you authorized |
| Verify the registry | One request per destination URL |
| Verify a backlink | One request to the source page |
| Verify listing evidence | One request to the live URL |
| Check entity consistency | One request per URL on your brand profile |
| Submit IndexNow | One POST to the IndexNow endpoint |

**Never:** your project data, brand profile, analytics, plans or any other
record. There is no telemetry, no analytics on LaunchOS itself, and no call to
any AI provider.

## Third-party contact

Your crawler user agent reaches the sites you audit. The default identifies
itself as `LaunchOS-Audit/0.1`; override with `LAUNCHOS_USER_AGENT`. Set it to
something that identifies you — site owners reading logs appreciate it.

## Personal data

- **UTM parameters** are checked for personal data and rejected if they contain
  an `@`, a long digit run, a government-identifier pattern or a field name
  associated with personal data.
- **Contact details** require a stated basis for how you legitimately hold them.
  There is no scraping of contact details anywhere in the codebase.
- **Contact email** is only included in generated listings when explicitly
  marked public on the brand profile.

## Export and deletion

```bash
launchos project export --project <slug> --out export.json
launchos project delete --project <slug> --yes
```

Export returns every row across all 36 tables for that project. Deletion
cascades — `tests/security.test.ts` asserts no orphan rows survive.

## If you host it

LaunchOS ships with **no authentication**, because it is built to run locally.
It holds unreleased plans and private business records. If you put it on a
network, put a reverse proxy with authentication in front of it and restrict it
to people who should see those records.

## Regional notes

Under GDPR and India's DPDP Act, third-party analytics with cookies generally
needs consent. The tool registry flags this on Google Analytics and Microsoft
Clarity and lists self-hosted alternatives. LaunchOS does not install analytics
on your site and does not decide this for you.
