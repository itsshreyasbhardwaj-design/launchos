# GitHub Actions

## Shipped workflows

### `ci.yml` — on push and pull request

Type-checks the app and the core, runs the full test suite, and runs a
production build. Network-dependent tests are skipped in CI via
`LAUNCHOS_SKIP_NETWORK_TESTS=1`, so a flaky network never turns into a red
build.

Roughly 2–3 minutes per run.

### `scheduled-audit.yml` — opt-in, disabled by default

A weekly audit of a site you have authorized, which opens an issue when it finds
critical or high-severity problems.

It is disabled by default: the `schedule` trigger is commented out and the job
requires `vars.LAUNCHOS_ENABLE_SCHEDULED_AUDIT == 'true'`. Enable it only for a
domain you control, and set `vars.LAUNCHOS_AUDIT_URL`.

It never publishes anything. It crawls, analyses and reports.

## Free usage

Public repositories get unlimited Actions minutes. Private repositories get a
monthly allowance on the free plan, after which billing applies — check GitHub's
current billing documentation for the figures, which change.

LaunchOS keeps usage small regardless:

- `actions/setup-node` with `cache: npm`.
- `concurrency` with `cancel-in-progress`, so a force-push does not leave two
  runs racing.
- `timeout-minutes` on every job.
- The scheduled audit runs weekly, not nightly, and caps pages.
- No matrix build. One Node version, because the project pins a minimum.

## Secrets

No workflow requires a secret. If you add an integration later, use repository
secrets — never a file. `.gitignore` already covers `.env*`, `data/` and
`*.db`, so project records and credentials cannot be committed by accident.

`GITHUB_TOKEN` permissions are set to the minimum each job needs
(`contents: read`, plus `issues: write` only on the audit job).
