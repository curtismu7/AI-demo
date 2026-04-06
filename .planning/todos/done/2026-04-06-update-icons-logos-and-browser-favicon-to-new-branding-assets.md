---
created: 2026-04-06T12:02:00.000Z
title: Update icons, logos and browser favicon to new branding assets
area: ui
files:
  - banking_api_ui/public/logo.svg
  - banking_api_ui/public/favicon.svg
  - banking_api_ui/public/bx-finance-admin-logo.png
  - banking_api_ui/public/bx-finance-admin-logo.svg
  - banking_api_ui/public/bx-finance-pingone-logo.png
  - banking_api_ui/public/bx-finance-pingone-logo.svg
  - banking_api_ui/public/index.html
  - Logos-icons/super bank dark logo.png
  - Logos-icons/Gemini_Generated_Image_bjlxohbjlxohbjlx.png
  - banking_api_ui/src/components/UserDashboard.js
  - banking_api_ui/src/App.js
---

## Problem

Current branding uses old BX Finance logos (`bx-finance-admin-logo`, `bx-finance-pingone-logo`, `logo.svg`, `favicon.svg`). New assets exist in `./Logos-icons/` directory:
- `Logos-icons/super bank dark logo.png` — new primary Super Banking logo (dark variant)
- `Logos-icons/Gemini_Generated_Image_bjlxohbjlxohbjlx.png` — new generated icon/logo asset

Browser tab still shows old favicon. All logo references in the UI, admin panel, and public HTML need updating to match the new Super Banking branding.

## Solution

1. Convert/optimize new logo assets as needed (SVG preferred, PNG fallback)
2. Replace `banking_api_ui/public/favicon.svg` (and add `favicon.ico` if needed) with new icon derived from new logo assets
3. Update `banking_api_ui/public/logo.svg` to new Super Banking logo
4. Replace or update `bx-finance-admin-logo.*` and `bx-finance-pingone-logo.*` references
5. Update `banking_api_ui/public/index.html` — `<link rel="icon">`, `<meta property="og:image">`, title if needed
6. Audit all `<img src=...>` and CSS `background-image` references in React components for any old logo paths
7. Update branding in vertical-specific components if they reference logos directly
8. Delete or archive old BX Finance logo files once replaced
9. Test favicon displays correctly in Chrome, Safari, Firefox
