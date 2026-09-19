---
version: alpha
name: Dark-dashboard-design-analysis
description: A bold, dark-mode analytics-dashboard language — the visual family of trading terminals and sales/ops dashboards rather than a bright fintech ledger. Near-black navy canvas throughout, a single vivid orange accent for the active state and primary actions, monospace tabular figures on every number, fully-rounded stadium-shaped segmented controls for view switching, and large-radius cards that read as distinct panels through surface-color contrast rather than borders or shadows. Numbers are the entire point of this genre — they render loud, monospaced, and white, with a small colored delta badge doing the "is this good or bad" work next to them.

colors:
  canvas: "#0a0e17"
  surface: "#141a26"
  surface-strong: "#1b2233"
  ink: "#f5f6f8"
  body: "#c7ccd6"
  muted: "#8a92a3"
  muted-soft: "#5c6478"
  hairline: "#232b3d"
  hairline-soft: "#1c2230"
  primary: "#ff7a29"
  primary-active: "#e8631a"
  primary-disabled: "#7a4a2b"
  on-primary: "#0a0e17"
  win: "#34d399"
  error: "#f75466"
  error-hover: "#e13b4d"

typography:
  figure-hero:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: 40px
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: -0.5px
    fontVariantNumeric: tabular-nums
  figure-md:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.3
    fontVariantNumeric: tabular-nums
  title:
    fontFamily: "Inter, sans-serif"
    fontSize: 18px
    fontWeight: 700
    lineHeight: 1.3
  label-caption:
    fontFamily: "Inter, sans-serif"
    fontSize: 11px
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: 1px
    textTransform: uppercase
  body-md:
    fontFamily: "Inter, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5

rounded:
  sm: 10px
  md: 16px
  lg: 20px
  xl: 24px
  full: 9999px

components:
  segmented-tab:
    backgroundColor: "{colors.surface-strong}"
    activeBackgroundColor: "{colors.primary}"
    activeTextColor: "{colors.on-primary}"
    inactiveTextColor: "{colors.muted}"
    rounded: "{rounded.full}"
    height: 48px
  stat-card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: 20px
  delta-badge-positive:
    textColor: "{colors.win}"
  delta-badge-negative:
    textColor: "{colors.error}"
  bar-row-track:
    backgroundColor: "{colors.surface-strong}"
    rounded: "{rounded.full}"
    height: 8px
---

## Overview

This replaces `DESIGN-mercury.md`'s light professional-fintech look with a dark analytics-dashboard aesthetic, sourced from a Samsung sales-analytics dashboard reference (Mobbin-adjacent trading-terminal/ops-dashboard genre) rather than a light banking UI. The move isn't cosmetic-only: this genre is built entirely around one thing — **making a number the loudest object on the screen** — which maps unusually well onto a poker ledger app, where "net chips" or "you owe ₹X" *is* the thing a player opens the app to see.

**Key characteristics:**
- **Canvas is near-black navy** (`#0a0e17`), always — this app still has exactly one theme, no light/dark toggle; the single theme itself is just dark now, the same "no `prefers-color-scheme` leakage" rule as both retired themes, pointed the other way.
- **Cards separate from the canvas by surface color alone** (`#141a26` on `#0a0e17`), not by border or shadow — depth comes from a two-step navy scale, exactly like the reference's KPI card sitting on the page floor.
- **One accent, vivid orange** (`#ff7a29`) — carries the active segmented-tab state, primary buttons, and the "you" highlight. Same one-accent restraint both retired themes had; brighter and more attention-grabbing to suit a live-game screen someone glances at mid-hand.
- **Every number is monospace and tabular** — net chips, buy-in counts, settlement amounts, the hero YTD-style figure. This was an add-on utility class in the retired theme; here it's load-bearing to the whole visual identity.
- **Stadium-shaped segmented controls** for any real either/or or multi-way view switch — fully rounded, filled orange on the active segment, dark surface on the rest. Only used where a real switch already exists in the product (rake masked/revealed, table status auto/open/full) — never invented just to decorate a screen.
- **Large card radius** (16–20px) paired with fully-rounded (`{rounded.full}`) pills and badges — a wider gap between "card" and "pill" shape than either retired theme had, which is part of what makes the reference read as a dashboard rather than a form.

## Colors

### Surface
- **Canvas** (`#0a0e17`): page floor, everywhere.
- **Surface** (`#141a26`): card/panel fill — one step up from canvas.
- **Surface Strong** (`#1b2233`): nested fills — inactive segmented-tab background, track behind a bar-row fill, input fields.

### Accent
- **Primary / Orange** (`#ff7a29`): active tab, primary CTA, the live-game "in progress" dot.
- **Primary Active** (`#e8631a`): press state.
- **Primary Disabled** (`#7a4a2b`): muted orange tint for a disabled CTA on a dark surface (a pale tint like the light themes used doesn't read on black, so this one darkens/desaturates instead).
- **On Primary** (`#0a0e17`): near-black text on the orange fill — white-on-orange has worse contrast than black-on-orange at this saturation, unlike the light themes' white-on-accent buttons.

### Text
- **Ink** (`#f5f6f8`): headlines, hero figures, primary content — near-white, never pure `#fff` (matches the reference's slightly warm white).
- **Body** (`#c7ccd6`): running text.
- **Muted** (`#8a92a3`): labels, captions, inactive tab text.
- **Muted Soft** (`#5c6478`): the least prominent text — placeholder copy, disabled states.

### Hairline
- **Hairline** (`#232b3d`): the one place a border survives — a thin seam on a card that sits directly against another card, or a divider between list rows. Barely visible on dark, which is the point.

### Semantic
- **Win** (`#34d399`): a positive delta, confirmed status — brighter/minter than either retired theme's green, to stay legible on near-black.
- **Error** (`#f75466`): a negative delta, disputed status, destructive actions.

## Typography

Two families do all the work: **Inter** for every label, headline, and running-text element (unchanged from both retired themes — it was never the wrong choice, just paired with the wrong palette), and the **system monospace stack** (`ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` — Tailwind's built-in `font-mono`) for every number.

| Token | Size | Weight | Use |
|---|---|---|---|
| `{typography.figure-hero}` | 40px | 700, mono, tabular-nums | The one number a screen exists to show — net chips on My Game, the settlement total |
| `{typography.figure-md}` | 16px | 600, mono, tabular-nums | In-list amounts — buy-in counts, per-player net, bar-row values |
| `{typography.title}` | 18px | 700 | Screen/section titles |
| `{typography.label-caption}` | 11px | 700, uppercase, 1px tracking | Segmented-tab labels, stat-card eyebrow text ("YTD · VALUE") |
| `{typography.body-md}` | 16px | 400 | Form inputs, running copy |

## Shape

`{rounded.sm}` (10px) for inputs and small buttons, `{rounded.lg}` (20px) for cards, `{rounded.full}` for segmented tabs, status pills, and the delta badge. Nothing sits between "10px" and "full" — there's no medium-round button the way the retired themes had, because this genre doesn't have a soft-rounded middle ground; a control is either a sharp-ish rectangle or a stadium.

## Elevation

No shadow tier. Depth is 100% the canvas → surface → surface-strong scale plus, on a card that needs one more step of separation (a modal, a bottom sheet), a hairline border. This is a bigger departure than either retired theme's "one shadow tier" — dark UIs read shadows poorly (a black shadow on a near-black background barely shows), so this genre leans on light-value steps instead.

## Components

- **`segmented-tab`** — A row of stadium-shaped buttons, `{colors.surface-strong}` fill, `{colors.muted}` text when inactive; the active segment gets `{colors.primary}` fill and `{colors.on-primary}` text. Used only where a real switch exists in the product already (e.g. Live Game's rake masked/revealed, table status auto/open/full) — never added purely for decoration.
- **`stat-card`** — `{colors.surface}` panel, `{rounded.lg}`, an uppercase `{typography.label-caption}` eyebrow, a `{typography.figure-hero}` number beneath it, and an optional delta badge under that.
- **`delta-badge`** — A small pill (arrow glyph + percentage) in `{colors.win}` or `{colors.error}`, no background fill — just colored text, matching the reference's plain green "↗ 6.6%" treatment.
- **`bar-row`** — A label, a value in `{typography.figure-md}` right-aligned, and (where the screen already has two comparable series, e.g. this month vs. last) a pair of stacked `{colors.hairline-soft}`-track / `{colors.primary}`-fill stadium bars beneath.

## Known Gaps

- **No charts.** The reference's bar-list is a real comparison chart; this app adopts its *visual grammar* (stadium bar, monospace value) for its own list rows (roster buy-in counts, settlement amounts) rather than building a charting layer that doesn't exist in the product yet.
- **No floating action button.** The reference's FAB opens an AI assistant this app doesn't have. Adopting the shape without a real function behind it would be decoration masquerading as a feature, so it's left out.
