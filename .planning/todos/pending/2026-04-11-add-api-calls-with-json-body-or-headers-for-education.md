---
created: 2026-04-11T13:43:56.799Z
title: Add API calls with JSON body or headers for education
area: docs
files:
  - banking_api_server/services/
  - banking_api_ui/src/components/PingOneTestPage.jsx
---

## Problem

Users cannot see what API calls look like (JSON body, headers) for educational purposes. Understanding the structure of API calls is important for learning how the system works and for debugging.

## Solution

Create a service to capture and display API calls with their JSON bodies and headers. This service should:
- Capture API request/response data (method, URL, headers, body)
- Display this information in a user-friendly format for education
- Be reusable across multiple components since there will be many API calls to display
- Integrate with PingOne test page and other educational components
