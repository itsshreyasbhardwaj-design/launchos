# Social marketing

## Platform adaptation

Ten channels: X, LinkedIn, Instagram, Facebook, Threads, YouTube, Pinterest,
Bluesky, Reddit, plus preset-driven defaults.

Each gets a different structure, not a different trim of the same text:

- **X / Bluesky** — headline, one-line description, link. Terse.
- **LinkedIn** — headline, description, the problem, a bulleted feature list,
  the audience, the link. The first two lines carry it because LinkedIn
  truncates at roughly 200 characters.
- **Instagram** — visual-first caption, with a warning that captions have no
  clickable links so the URL is written for the bio.
- **Reddit** — first-person, with "Disclosure: I am the maker" appended
  automatically and a warning that rules differ per community.
- **YouTube** — description with a chapter list, flagged as placeholder
  timestamps to replace from your real edit.

A test asserts that three platforms produce three distinct bodies.

## Character limits

Hard platform limits are enforced: X 280, Bluesky 300, Threads 500, Pinterest
500, LinkedIn 3000, Instagram 2200, YouTube 5000, Reddit 40000. Over-limit text
is trimmed on a word boundary and a warning says it was trimmed and by how much.

Values labelled `launchos_recommendation` are readability guidance, marked as
such so nobody mistakes them for a platform rule.

## Publishing rules

**LaunchOS does not publish.** Not to any platform, not with any integration, not
behind any flag.

- A draft with warnings **cannot be approved**.
- A draft can only be marked `published` **with a URL to the live post**.
  Attempting it without one is refused with: "LaunchOS does not publish for you
  and will not record an unverified publication."
- Approval records who approved it.

## Visual assets

Social cards are generated as **SVG**: no image library, no font download, no
paid design API, no network request at render time. Launch, feature, comparison,
quote and preview variants, with your recorded brand colours.

```bash
launchos social card --title "Ship faster with fewer meetings" \
  --subtitle "Free and open source" --badge "Launching today" --out card.svg
```

Convert to PNG with any local tool — `rsvg-convert`, Inkscape, ImageMagick — or
screenshot it with Playwright if you already have it. Text is escaped, so a
title containing markup cannot inject anything.

## What is refused

Spam posting, mass unsolicited DMs, bulk unsolicited email, fake reviews, fake
testimonials, purchased followers, fake upvotes, fake traffic, and automated
promotional replies. None of these have a code path.
