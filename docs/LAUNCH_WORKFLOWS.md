# Launch workflows

Every playbook states its **automation boundary** — the exact point where
LaunchOS stops and you start.

## Product Hunt

Readiness is checked against real evidence: brand completeness, verified fields,
audit findings at critical and high severity, and launch status. Gallery, demo
video and maker comment are marked `manual` because only you can judge them.

Prepared copy: name, tagline (trimmed to 60), description (trimmed to 260), and
a maker-comment outline with your recorded problem and features filled in — and
`[be specific — this is the part people trust]` left as a prompt where it must
be your words.

Policy notes, stated before anything else:

> Asking for, buying or organising upvotes violates Product Hunt policy and gets
> launches removed. LaunchOS will not help with it.

A four-phase schedule from −14 days to +7 days. `launchos launch schedule
product_hunt --date YYYY-MM-DD` turns it into dated tasks.

**Boundary:** LaunchOS prepares copy and assets and tracks the checklist. You
publish the launch and write the comments.

## Show HN

This playbook deliberately refuses to write your submission.

> LaunchOS deliberately does not draft your submission text. A Show HN written
> by a tool reads like one, and the audience notices. What follows is factual
> notes for you to write from.

What it provides instead: your recorded facts, a title format, and a readiness
check that includes "a stranger can try it without signing up or paying" —
because a signup wall usually gets a hostile response on Show HN.

**Boundary:** LaunchOS will not generate or post a Show HN submission. It gives
you verified facts and a readiness check.

A test asserts the copy object contains exactly one key:
`facts_for_you_to_write_from`.

## GitHub release

Repository description (trimmed to the documented 350-character limit),
suggested topics derived from your category and features (capped at the
documented 20), README guidance, licence check, release notes and social preview.

**Boundary:** LaunchOS generates metadata and checklists. It does not push to
your repository or create releases.

## Community launch

Blocked until at least one community is recorded **with its actual rules**.
Generates per-platform drafts and tells you to edit each so it reads like you
wrote it for that specific community.

**Boundary:** LaunchOS will not post to communities and will not generate
promotional replies.

## Launch calendar

Scheduling a playbook materialises its phases into dated tasks with priority
weighting — pre-launch and launch-day tasks score higher than follow-ups.

## Publishing approvals

Anything that would reach the outside world can be recorded as a publishing task
in `awaiting_approval`. It needs a named approver to move to
`approved_for_manual_action`. There is no state beyond that, because LaunchOS
does not perform the action.
