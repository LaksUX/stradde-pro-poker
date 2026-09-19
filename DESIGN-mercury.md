---
version: alpha
name: Mercury-finance-design-analysis
description: A serious, professional fintech design language pulled from business-banking dashboards (Mercury, Stripe, Ramp-class products) rather than consumer marketplace design. Cool neutral-gray canvas, near-black navy ink (never a warm brand color for headlines), a single restrained indigo accent, and hairline 1px borders standing in for shadows almost everywhere. Corners are noticeably tighter than a consumer-marketplace system — cards read as "instrument panels," not soft cushions. Numbers get tabular alignment wherever they appear in a list or table, because in a finance product misaligned digits read as untrustworthy.

colors:
  primary: "#4f46e5"
  primary-active: "#4338ca"
  primary-disabled: "#c7d2fe"
  on-primary: "#ffffff"
  ink: "#0f1729"
  body: "#3d4451"
  muted: "#667085"
  muted-soft: "#98a2b3"
  hairline: "#e4e7ec"
  hairline-soft: "#eef0f3"
  border-strong: "#b8bfc9"
  canvas: "#ffffff"
  surface-soft: "#f6f7f9"
  surface-strong: "#eef0f3"
  error: "#dc2626"
  error-hover: "#b91c1c"
  win: "#16a34a"

typography:
  display-lg:
    fontFamily: "Inter, -apple-system, system-ui, sans-serif"
    fontSize: 24px
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: -0.3px
  display-md:
    fontFamily: "Inter, sans-serif"
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: -0.1px
  title-sm:
    fontFamily: "Inter, sans-serif"
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: 0
  body-md:
    fontFamily: "Inter, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  body-sm:
    fontFamily: "Inter, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: 0
  caption:
    fontFamily: "Inter, sans-serif"
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: 0.1px
    textTransform: uppercase
  figure-lg:
    fontFamily: "Inter, sans-serif"
    fontSize: 32px
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: -0.4px
    fontVariantNumeric: tabular-nums
  figure-md:
    fontFamily: "Inter, sans-serif"
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: 0
    fontVariantNumeric: tabular-nums

rounded:
  none: 0px
  sm: 6px
  md: 10px
  lg: 14px
  xl: 20px
  full: 9999px

components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.sm}"
    height: 48px
  button-secondary:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    border: "1px solid {colors.ink}"
  card:
    backgroundColor: "{colors.canvas}"
    border: "1px solid {colors.hairline}"
    rounded: "{rounded.md}"
  status-pill:
    rounded: "{rounded.full}"
    padding: "2px 10px"
    typography: "{typography.caption}"
---

## Overview

Business-banking dashboards read as professional through restraint, not decoration: **Mercury**, **Stripe's** own dashboard, and **Ramp/Brex**-class products share a cool neutral-gray canvas, near-black (not warm-gray) ink for numbers and headlines, one contained accent color used only for the primary action, and 1px hairline borders doing the elevation work that consumer apps hand to shadows. This is a deliberate departure from this app's previous `DESIGN-airbnb.md` sourcing: Airbnb is a warm, photography-led *consumer marketplace*; a ledger app tracking real money between real people should read closer to the tool a treasurer would trust, not a travel-booking flow.

**Key differences from the retired Airbnb theme:**
- **Cool neutral-gray floor** (`{colors.surface-soft}` — #f6f7f9) instead of Airbnb's warm pure white — the same trick Stripe and Mercury use to make white cards pop as distinct surfaces without a shadow.
- **Deep navy-black ink** (`{colors.ink}` — #0f1729) instead of Airbnb's warmer #222222 — cooler blacks read more "instrument panel," warmer ones read more "editorial."
- **A single indigo accent** (`{colors.primary}` — #4f46e5) replacing Rausch coral. Indigo/blue-violet is the fintech family's de facto accent (Stripe, Ramp, Mercury, Brex all converge here) — it reads as trustworthy and technical rather than energetic.
- **Tighter corners.** Airbnb's system is almost fully pill-shaped; this system caps interactive-element radius at 6–10px. Full pill radius (`{rounded.full}`) is kept only for status badges and avatars, never for buttons or cards — a button that's too round reads "consumer app," not "financial tool."
- **Tabular numerals on every money figure.** The Airbnb source had no numeric-table concept. Here, any amount rendered inside a list, table, or side-by-side comparison uses `font-variant-numeric: tabular-nums` (Tailwind's `tabular-nums` utility) so digits align vertically down the column — a small detail that is one of the most reliable "this was built by people who take money seriously" signals in finance UI.
- **Flatter elevation.** The one shadow tier is kept (for the bottom sheet and floating badges only) but tuned lighter and cooler-toned, since most surface separation in this system comes from the hairline border + surface-soft/canvas contrast, not shadow.

## Colors

### Brand & Accent
- **Indigo** (`{colors.primary}` — #4f46e5): the single accent. Primary CTAs (Confirm, Request to join, End game & settle), links, and the invite QR's accent chrome.
- **Indigo Active** (`{colors.primary-active}` — #4338ca): press/hover state.
- **Indigo Disabled** (`{colors.primary-disabled}` — #c7d2fe): pale tint for disabled CTAs.

### Surface
- **Canvas** (`{colors.canvas}` — #ffffff): card and sheet surfaces — never the page floor.
- **Surface Soft** (`{colors.surface-soft}` — #f6f7f9): the page floor. Every screen's `<body>` background.
- **Surface Strong** (`{colors.surface-strong}` — #eef0f3): icon-button fills, table header rows, the rake-masked state.

### Hairlines & Borders
- **Hairline** (`{colors.hairline}` — #e4e7ec): default 1px card border and list-row divider — this is the system's primary depth cue, doing the job Airbnb's shadow tier did.
- **Hairline Soft** (`{colors.hairline-soft}` — #eef0f3): nested dividers inside a card (e.g. between roster rows).
- **Border Strong** (`{colors.border-strong}` — #b8bfc9): focus/active input outlines.

### Text
- **Ink** (`{colors.ink}` — #0f1729): headlines, primary figures, player names.
- **Body** (`{colors.body}` — #3d4451): running text, secondary descriptions.
- **Muted** (`{colors.muted}` — #667085): labels, timestamps, de-emphasized meta.
- **Muted Soft** (`{colors.muted-soft}` — #98a2b3): the least prominent text — disabled states, placeholder copy.

### Semantic
- **Win** (`{colors.win}` — #16a34a): positive net, confirmed status.
- **Error / Loss** (`{colors.error}` — #dc2626): negative net, disputed status, destructive actions.

## Typography

Font family stays **Inter** — it's already this app's substitute for Airbnb Cereal, and it's also the de facto typeface of the fintech dashboard genre itself (Mercury, Ramp, and Linear-adjacent products all ship Inter or an Inter-alike), so no font change was needed to land the new identity — the shift is entirely in weight, size discipline, and numeral treatment.

| Token | Size | Weight | Use |
|---|---|---|---|
| `{typography.figure-lg}` | 32px | 600, tabular-nums | The one hero number per screen — net chips on My Game, the settlement amount |
| `{typography.display-lg}` | 24px | 600 | Screen titles (game name on Live Game) |
| `{typography.display-md}` | 18px | 600 | Card section heads |
| `{typography.figure-md}` | 16px | 600, tabular-nums | In-list amounts — buy-in counts, per-player net, transfer rows |
| `{typography.title-sm}` | 14px | 600 | Player names, row titles |
| `{typography.body-md}` | 16px | 400 | Form inputs, running copy |
| `{typography.body-sm}` | 14px | 400 | Secondary meta lines |
| `{typography.caption}` | 12px | 500, uppercase | Status pill text, section labels |

## Shape

Radius scale is deliberately tighter than the retired Airbnb scale: `{rounded.sm}` 6px (buttons, inputs), `{rounded.md}` 10px (cards), `{rounded.lg}` 14px (larger panels), `{rounded.xl}` 20px (bottom sheet). `{rounded.full}` remains available but scoped to status pills and avatars only — carrying it over to buttons or cards would pull the system back toward the consumer-marketplace read this retheme is moving away from.

## Elevation

Same one-tier philosophy as before, retuned cooler and lighter to sit behind hairline borders rather than replace them:

```
box-shadow: 0 0 0 1px rgba(16,24,40,0.04), 0 1px 2px rgba(16,24,40,0.06), 0 2px 4px rgba(16,24,40,0.04);
```

Used only where the previous system used it — the bottom sheet / modal surface and floating badges. Everywhere else, the hairline border is the entire depth cue.

## Components

- **`button-primary`** — Indigo fill, white text, `{rounded.sm}` (6px), 48px height. Same sizing as before; only the fill color and corner radius change.
- **`button-secondary` / `ghost`** — White fill, 1px ink or hairline outline, `{rounded.sm}`.
- **`card`** — White surface, 1px `{colors.hairline}` border, `{rounded.md}` (10px). No shadow by default.
- **`status-pill`** — Fully rounded (`{rounded.full}` is the one place it survives), soft tint background (`bg-green-50`/`bg-red-50`, unchanged) with `{colors.win}`/`{colors.error}` text, `{typography.caption}`.
- **Money figures** — Any amount inside a list, table, or row-vs-row comparison gets Tailwind's `tabular-nums` utility class so digit columns align.

## Known Gaps

- **No dark mode**, same as the retired theme — this app has one canvas.
- **Icon set** wasn't re-sourced from the fintech references; existing icons/emoji in the codebase are kept as-is, since iconography wasn't part of what made those reference apps read as "professional" — the color/type/shape system was.
