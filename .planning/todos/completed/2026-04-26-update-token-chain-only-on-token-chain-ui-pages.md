---
created: 2026-04-26T10:29:48.264Z
title: Update token-chain only on token-chain UI pages
area: ui
files: []
---

## Problem

Token-chain updates are happening too often and are not scoped to pages that actually render token-chain. This causes unnecessary updates and noise when navigating unrelated UI screens.

## Solution

Gate token-chain updates behind route/page awareness so updates run only when the active UI page contains token-chain. Add a clear condition around token-chain update triggers (or subscriptions/effects) to no-op outside token-chain pages.
