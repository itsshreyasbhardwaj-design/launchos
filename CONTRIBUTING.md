# Contributing

## The rule that matters

**A feature that reports a number LaunchOS cannot evidence will not be merged.**

No search volume it did not receive. No traffic forecast. No ROI estimate. No AI
visibility score presented as a ranking. No listing marked live without
verification. No "significant" result the sample does not support.

If a feature would be more impressive with an invented number, that is the
strongest possible argument against adding the number.

## Setup

```bash
npm install
npm run build:core
npm test
```

Node 22.5+ is required (`node:sqlite`).

## Project layout

- `src/core/` — the domain layer. **No React, no Next.js, no runtime
  dependencies.** Both the CLI and the dashboard import from here, so a rule
  implemented once applies to both.
- `src/cli/` — terminal interface.
- `src/app/` — Next.js dashboard and server actions. Business logic belongs in
  `src/core`, not here.
- `tests/` — Vitest.

## Adding a check to the audit engine

In `src/core/audit/checks.ts`, every finding must supply:

| Field | Requirement |
| --- | --- |
| `evidence` | The actual observation, with the actual values |
| `impactHypothesis` | Why it matters, as a hypothesis — never a promise about rankings |
| `suggestion` | What to do |
| `verification` | How to confirm it is fixed, independently of LaunchOS |
| `complexity` | trivial / small / medium / large |
| `docsUrl` | Primary documentation where one exists |

A test in `tests/audit.test.ts` asserts every finding has a non-trivial
`evidence`, `impactHypothesis`, `suggestion` and `verification`. A check that
cannot supply all four is not ready.

## Adding a directory

In `src/core/data/directories.ts`:

1. The destination must **exist**. Open it.
2. `submissionUrl` only if you are confident of the path. Otherwise `null`.
3. `freeSubmission: 'free'` only if free self-submission is documented.
   Otherwise `'unknown'`.
4. `verificationSource` must say how a reader can check for themselves.
5. Field limits you did not read in the platform's own documentation get
   `...CONSERVATIVE` so they are labelled as LaunchOS defaults.

## Adding an integration

See [API_INTEGRATIONS.md](docs/API_INTEGRATIONS.md). It must be optional, must
degrade rather than break, must mark its data `connected`, must never require
payment, and must never store a credential in the database.

## Style

Match the surrounding code. Comments explain *why*, not *what* — particularly
where a behaviour looks like a missing feature but is a deliberate refusal.
Those comments are load-bearing, because without them someone eventually
"fixes" them.

## Tests

Anything with a decision needs a test. Anything that *refuses* something needs a
test that it refuses, because that is the part most likely to be regressed by a
well-meaning change.

## Pull requests

Describe what changed and why. If you changed a refusal, explain why the
refusal was wrong — that is a bigger change than it looks.
