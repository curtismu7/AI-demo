---
created: 2026-04-20T02:08:47.953Z
title: Make TopNav header professional like a bank site
area: ui
files:
  - banking_api_ui/src/components/TopNav.js
  - banking_api_ui/src/components/TopNav.css
---

## Problem

The current TopNav header doesn't look like a professional banking application. It needs a more polished, trust-inspiring design appropriate for a financial institution — clean typography, refined color palette, proper spacing, and bank-appropriate visual elements.

Recent work added a view-switch pill button (admin ↔ customer) and fixed the brand button border, but the overall header aesthetic still needs elevation to match what users would expect from a real bank's web app.

## Solution

Redesign TopNav.css and adjust TopNav.js markup to match professional banking UI conventions:
- Clean, minimal top bar with a solid neutral or brand-color background (deep navy, slate, or white with strong border)
- Bank-style logo/brand treatment (wordmark style, no decorative browser button look)
- Refined typography — heavier weight for brand, lighter for nav items
- Subtle hover states, no playful gradients
- Consistent height, padding, and alignment matching banking SaaS products (e.g., Chase, Bank of America, Capital One web apps)
- Consider adding a thin accent stripe or shadow below the nav for separation
- View-switch button should use a more understated style (outlined, not pill background)
