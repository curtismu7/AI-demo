---
created: 2026-04-01T16:00:00.000Z
title: Lighten marketing page AI assistant dock background
area: ui
files:
  - banking_api_ui/src/components/BankingAgent.css:2382-2469
---

## Problem

The AI Banking Assistant embedded dock on the `/marketing` page (`https://banking-demo-puce.vercel.app/marketing#features`) has an extremely dark/black background (`#030712`, `#111827`, `#1f2937`) that clashes with the light marketing page design. User feedback: "not so dark, not white but much lighter".

Specific CSS block:

```css
/* ─── Marketing page: white site chrome → agents read as bold black/dark widgets ─ */
.App--marketing-page .global-embedded-agent-dock-wrap {
  background: #030712 !important;   /* near-black → too dark */
  border-top: 3px solid #000000 !important;
}
.App--marketing-page .global-embedded-agent-dock-wrap--collapsed {
  background: #111827 !important;   /* near-black → too dark */
}
.App--marketing-page .embedded-agent-dock__toolbar {
  background: #1f2937 !important;   /* dark-gray → too dark */
}
```

There is also a duplicate/override block at `LandingPage.css:1013` and `globalTheme.css:196` that may need matching updates.

## Solution

Replace the near-black marketing dock colors with light slate tones that sit well on the white marketing background. Suggested palette (not white, but clearly lighter):

| Element | Current | Suggested |
|---------|---------|-----------|
| `dock-wrap` background | `#030712` | `#f1f5f9` (slate-100) |
| `dock-wrap--collapsed` bg | `#111827` | `#e2e8f0` (slate-200) |
| `toolbar` background | `#1f2937` | `#e8edf3` (between slate-100/200) |
| border-top | `#000000` | `#cbd5e1` (slate-300) |
| title text | `#f9fafb` (light) | `#1e293b` (dark, for contrast on light bg) |
| collapse btn color | `#e5e7eb` | `#475569` |
| resize handle | dark gradient | `#e2e8f0` surface |

Also update the dark-theme override block at `BankingAgent.css:2469` so it doesn't re-apply the dark colors when marketing page is in light mode.
