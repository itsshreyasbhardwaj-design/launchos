# Security

## Reporting a vulnerability

Open a GitHub security advisory on the repository, or a regular issue if the
problem is not sensitive. Please do not open a public issue for anything that
would let someone reach an internal network through a LaunchOS install.

## Threat model

LaunchOS runs locally, holds private business records and makes outbound HTTP
requests to addresses derived from user input. The two things that matter most
are therefore: **where requests can go**, and **what can be committed by accident**.

## Server-side request forgery

`assertSafeUrl` runs on every URL and on **every redirect hop**, so a public
host cannot bounce the crawler onto an internal address.

Blocked:

- Non-HTTP(S) schemes: `file:`, `ftp:`, `gopher:`, `data:`.
- URLs with embedded credentials.
- Internal-looking hostnames: `localhost`, `*.localhost`, `*.local`,
  `*.internal`, `*.test`, `*.invalid`, `*.home.arpa`.
- IPv4: loopback `127/8`, `0/8`, private `10/8`, `172.16/12`, `192.168/16`,
  link-local `169.254/16`, CGNAT `100.64/10`, `192.0.0/24`, benchmarking
  `198.18/15`, documentation `198.51.100/24` and `203.0.113/24`, and everything
  from `224/4` up.
- IPv6: `::`, `::1`, link-local `fe80::/10`, unique-local `fc00::/7`, multicast
  `ff00::/8`, documentation `2001:db8::/32`, and IPv4-mapped forms that resolve
  to a blocked IPv4 address.
- Hostnames whose DNS resolution returns **any** address in those ranges.

`LAUNCHOS_ALLOW_PRIVATE_HOSTS=1` disables this. It exists for auditing a site on
a private network you own. Do not set it otherwise.

## Crawl authorization

A host is only crawlable after being registered and explicitly authorized with a
stated reason, recorded against the person who authorized it. The audit engine
reads this list **from the database**, not from its caller, so a crafted web
request cannot widen the scope.

## Crawl safety

Page cap, depth cap, 3MB response cap, 5-redirect cap, 15s timeout, per-host
serialization with a 750ms gap, redirect-loop detection, robots.txt compliance,
and a 5xx robots.txt treated as disallow.

## Secrets

- `.gitignore` covers `data/`, `*.db*`, `.env*`, `reports/` and `evidence/`.
- No credential is stored in the database.
- No workflow requires a secret; `GITHUB_TOKEN` permissions are minimised.
- The crawler sends no credentials and does not follow links from untrusted
  content into authenticated areas — it only requests authorized hosts.

## Project isolation

Every query is project-scoped. Server actions resolve the project from the
session cookie on the server, never from form input. Deletes cascade.

## Input validation

URLs are parsed and validated. CSV parsing is bounded and type-coerced. Upload
size is capped at 8MB. Text destined for SVG or HTML is escaped. SQL uses
parameterised statements exclusively — there is no string-built SQL in the
codebase.

## What LaunchOS does not protect against

- **There is no authentication.** Anyone who can reach the port can read and
  modify everything. It is built to run locally; put auth in front of it before
  hosting.
- **No encryption at rest.** The SQLite file is readable by anyone with
  filesystem access. Use full-disk encryption.
- **No rate limiting on the dashboard itself.** Single-user by design.
