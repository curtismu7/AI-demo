---
created: 2026-04-19T02:19:13.527Z
title: Fix user button colors on marketing page
area: ui
files:
  - banking_api_ui/src/components/LandingPage.css:145-153
  - banking_api_ui/src/index.css:384-393
  - banking_api_ui/src/components/LandingPage.js:92-96
---

## Problem

The "Sign In as Customer" button on the marketing/landing page has unreadable text. The button uses `.btn-secondary` class, and the LandingPage.css (line 145) intends it to be white background with red text and red border. However, the global `.btn-secondary` in index.css (line 384) sets `background: linear-gradient(...)` with `color: #fff` (white text), which likely overrides or conflicts with the landing page styles depending on CSS load order and specificity.

The result is white or near-white text that can't be read against the button background. Screenshot confirms the "Sign In as Admin" (btn-primary, red bg) is fine, but the adjacent user button text is invisible.

## Solution

Increase specificity of `.landing-header-actions .btn-secondary` in LandingPage.css to reliably override the global `.btn-secondary` from index.css. May need `!important` or a more specific selector chain. Ensure the button has: white background, red text (`#b91c1c`), red border, and visible hover state. Also check the hero section's `.hero-cta-secondary` button for the same issue.
