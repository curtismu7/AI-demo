---
phase: 242-pingone-api-transparency-all-test-pages-show-actual-api-endp
plan: "01"
subsystem: frontend/components
tags: [react, api-transparency, ApiCallPreviewCard, PingOneApiPanel]
dependency_graph:
  requires: []
  provides: [ApiCallPreviewCard, PingOneApiPanel-docsSectionTitle]
  affects: [banking_api_ui/src/components]
tech_stack:
  added:
    - banking_api_ui/src/components/ApiCallPreviewCard.jsx
    - banking_api_ui/src/components/ApiCallPreviewCard.css
  modified:
    - banking_api_ui/src/components/PingOneApiPanel.jsx
key_files:
  created:
    - banking_api_ui/src/components/ApiCallPreviewCard.jsx
    - banking_api_ui/src/components/ApiCallPreviewCard.css
  modified:
    - banking_api_ui/src/components/PingOneApiPanel.jsx
decisions:
  - "ApiCallPreviewCard is a self-contained card — no dependency on PingOneApiPanel"
  - "docsSectionTitle used as <a title=> tooltip on both components for hover context"
  - "statusClass applied to response body border-left for red error indicator"
  - "PingOneApiPanel already had docsUrl from prior session; only docsSectionTitle added"
metrics:
  duration: "~5 minutes"
  completed: "2026-04-27"
  tasks_completed: 1
  files_changed: 3
---

# Phase 242 Plan 01: ApiCallPreviewCard Summary

Created reusable `ApiCallPreviewCard` component establishing the shared contract for API transparency across all test pages. Extended `PingOneApiPanel` with `docsSectionTitle` prop.

## Tasks Completed

| # | Task | Files |
|---|------|-------|
| 1 | Create ApiCallPreviewCard + CSS | ApiCallPreviewCard.jsx, ApiCallPreviewCard.css |
| 1b | Add docsSectionTitle to PingOneApiPanel | PingOneApiPanel.jsx |

## Component Contract

```typescript
interface ApiCallPreviewCardProps {
  endpoint: string;
  method: string;
  docsUrl: string;
  docsSectionTitle: string;
  requestBody?: object | null;
  responseBody?: object | null;
  responseStatus?: number | null;
  durationMs?: number | null;
  defaultOpen?: boolean;
  label?: string;
}
```

## Self-Check: PASSED

- ApiCallPreviewCard renders method badge, endpoint, status badge, duration, docs link, collapsible request/response JSON
- PingOneApiPanel backward-compatible — docsSectionTitle is optional
- `npm run build` exits 0
