# Directory engine

## The registry

39 real destinations across launch platforms, software directories, AI product
directories, package registries, developer publishing, app discovery, local
listings, shopping, professional services, nonprofit listings and communities.

Rules this file is written under, in `src/core/data/directories.ts`:

1. **Nothing is invented.** Every `officialUrl` is a destination that exists.
2. **`submissionUrl` is null unless the path is well known.** A guessed
   submission URL wastes your time and looks like a broken product.
3. **`freeSubmission` is `free` only where free self-submission is the
   documented norm.** Anything uncertain is `unknown` — never optimistically
   free. Apple App Store and Google Play are `paid`, because developer
   registration costs money.
4. **`verificationStatus` starts at `unverified` for every row**, because seed
   data is not a live check.
5. **Field limits marked `conservative_default` are LaunchOS defaults**, chosen
   to be safely short, not platform-documented numbers. Where a limit *is*
   documented — App Store title 30, Play short description 80, GitHub repo
   description 350, Reddit title 300, LinkedIn tagline 120, Merchant Center
   product title 150 — it is recorded as fact with a note.

## Verification states

| State | Means |
| --- | --- |
| `unverified` | Seed data. Nobody has checked it. |
| `url_reachable` | `launchos directories verify` fetched the URL and it returned under 400, on the recorded date. |
| `url_unreachable` | The same check failed. |
| `operator_confirmed` | A human opened the real submission path and recorded what they found. |

**Reachability is not freeness.** A URL loading says nothing about whether
submission costs money. The two are tracked separately on purpose, and
re-seeding never overwrites an `operator_confirmed` row.

## Matching

Relevance is scored from preset membership, category priority within the preset,
registry priority and geographic fit. Eligibility is a separate axis, and it is
deliberately conservative — anything LaunchOS cannot establish becomes
`needs_check` with the question spelled out.

Hard gates, enforced in code:

- **Google Business Profile** requires in-person customer contact during stated
  hours. Without a local profile recording that, the project is treated as
  online-only and the destination is `not_eligible`. The blocker says why.
  There is no workaround, because inventing a location is a guidelines violation
  that gets profiles suspended.
- **Launch platforms** that require a usable product are `needs_check` while the
  project is `pre_launch`.
- **Paid destinations** are `paid_only` and cannot be approved.
- **Destinations with no verified submission URL** are `needs_check`.
- **Communities with per-community rules** (Reddit) are always `needs_check`,
  because the rules differ per subreddit and must be read.
- **Invite-only destinations** (Lobsters) are `needs_check` with a note that you
  should only plan it if you are already a member in good standing.
- **F-Droid** requires fully free software, checked against a recorded repository.
- **Nonprofit and India-specific registries** check preset and country.

## Listing preparation

Copy is built from the canonical brand profile only. Fields that are empty
produce a warning naming the field — never filler. Values over a platform limit
are trimmed on a word boundary and a warning says so. Unverified brand fields
produce a warning listing them.

The asset checklist reads `project_assets`, so an asset only counts once someone
has pointed at a real file or URL.

## Status machine

```
not_researched → eligibility_confirmed → content_ready → ready_for_submission
                                                              ↓
                                     submitted → pending_review → live
                                                              ↘ rejected
                                        live/submitted → needs_update
```

Terminal states: `not_eligible`, `paid_only`, `discontinued`.

**Approval requires all of:** a named approver, zero warnings, zero MISSING
assets, status `content_ready` or `needs_update`, and an eligibility state that
is not `not_eligible` or `paid_only`. All five are checked in
`approveListing`, and the refusal names which one failed.

**Submission** can only be recorded for an approved listing.

**Live** requires evidence. When the evidence is a URL, LaunchOS fetches it and
looks for your brand name in the body. No brand name, no `live` — the status
stays `pending_review` and the detail says exactly what was and was not found.

## Change propagation

When a *published-facing* brand field changes, the brand revision bumps. Every
listing built from an older revision is flagged, a task is created naming the
changed fields, and listings that are already `submitted`, `pending_review` or
`live` move to `needs_update`.

LaunchOS never rewrites a published listing. It tells you which ones drifted and
hands you updated copy.

## Submission automation

There is none, and that is a finding rather than a gap. None of these
destinations offers an authorized submission API that a third-party tool may use
on a user's behalf. So LaunchOS does the part it legitimately can: opens the
official page, shows the exact approved content with character counts, lists the
assets, states the platform's restrictions, and records evidence once you
confirm.

It does not bypass CAPTCHA, authentication, terms or anti-spam systems. If a
platform adds an official authorized API, the `api_authorized` submission method
already exists in the schema for it.
