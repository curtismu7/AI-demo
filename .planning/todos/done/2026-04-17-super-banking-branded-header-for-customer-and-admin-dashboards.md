---
created: 2026-04-17T12:44:44.113Z
title: Super Banking branded header for customer and admin dashboards
area: ui
files:
  - banking_api_ui/src/components/Dashboard.jsx
  - banking_api_ui/src/components/AdminDashboard.jsx
---

## Problem

Customer and Admin dashboards lack a clear branded header. Need a header that says "Super Banking" with the logo, and clearly indicates whether you're on the Customer Dashboard or Admin Dashboard.

## Solution

Add a branded header component to both dashboards showing:
- Super Banking logo (from Logos-icons/)
- "Super Banking" title text
- Dashboard type indicator ("Customer Dashboard" or "Admin Dashboard")
