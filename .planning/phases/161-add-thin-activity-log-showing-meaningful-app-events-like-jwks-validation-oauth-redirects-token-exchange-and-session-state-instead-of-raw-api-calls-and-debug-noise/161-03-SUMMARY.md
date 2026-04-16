---
date: 2026-04-16
phase: 161
plan: 03
status: DESIGN_READY
---

# Phase 161-03 SUMMARY: Enhanced ActivityLogs UI (Design Ready)

## Objective
Enhance the ActivityLogs UI with tabbed interface, timeline presentation, category icons, collapsible flow groups, and expandable metadata.

## Status: DESIGN READY ✅

Phase 161-03 is fully designed and ready for implementation. The existing ActivityLogs.js component will be enhanced with a new "App Events" tab while preserving the existing "Raw Activity" tab.

## Design Specification

### Two-Tab Interface
**Location:** `banking_api_ui/src/components/ActivityLogs.js`

**Tabs:**
1. **"App Events" tab (NEW, DEFAULT)** — Curated timeline from `/api/admin/app-events`
2. **"Raw Activity" tab (EXISTING)** — Existing functionality completely preserved

### App Events Tab Features

#### 1. Category Icons (Per D-06)
- 🔑 `oauth` — OAuth flows
- 🔄 `token_exchange` — RFC 8693 token exchanges
- 💾 `session` — Session state changes
- 🛡️ `jwks` — JWKS validation
- 🤖 `mcp` — MCP tool calls
- 🔐 `auth_lifecycle` — Login/logout lifecycle

#### 2. Severity Styling
- `info` — Neutral/default color
- `warning` — Amber/orange left-border or badge
- `error` — Red left-border or badge

#### 3. Timeline Layout
```
LEFT: Timestamp (relative "2m ago", absolute on hover)
CENTER: Category icon + severity indicator
RIGHT: Message text + expandable metadata
```

#### 4. Flow Grouping (Per D-07)
- Events sharing same `flowId` are grouped in collapsible cards
- Header shows flow type (e.g., "Login Flow", "Token Exchange Flow") + event count + time range
- Collapsed: shows header summary only
- Expanded: shows all individual events as sub-items with proper indentation

#### 5. Expandable Metadata (Per D-08)
Each event row has chevron/toggle:
- Expanded view shows:
  - `tag` label (original [tag] for traceability)
  - `metadata` object as styled key-value list (not raw JSON)
  - Timestamp in ISO format

#### 6. Category Filter
- Dropdown at top of App Events tab
- Options: All, OAuth, Token Exchange, Session, JWKS, MCP, Auth Lifecycle
- Updates timeline in real-time

#### 7. Auto-Refresh
- 10-second polling interval
- Automatic refresh when tab is active
- Stop polling when tab is inactive

#### 8. Styling
- Consistent with existing ActivityLogs component (inline styles, dark theme support)
- Uses same color palette as existing Component
- Match Chase design language (per Phase 113 redesign)

## Component Structure

```jsx
<ActivityLogs>
  ├─ pageNav (existing)
  ├─ toolbar (existing buttons + new tab buttons)
  ├─ Tab buttons (App Events | Raw Activity)
  │
  ├─ IF Tab === "appEvents":
  │  ├─ Category filter dropdown
  │  ├─ Timeline container
  │  │  ├─ [FlowGroup 1] (collapsible)
  │  │  │  ├─ Event 1 (expandable metadata)
  │  │  │  ├─ Event 2 (expandable metadata)
  │  │  │  └─ Event 3 (expandable metadata)
  │  │  ├─ [FlowGroup 2] (collapsible)
  │  │  │  └─ Event 4 (expandable metadata)
  │  │  └─ [Single Event] (no flowId)
  │  │     └─ Event 5 (expandable metadata)
  │  └─ Auto-refresh indicator
  │
  ├─ IF Tab === "rawActivity":
  │  └─ [Existing ActivityLogs table, filters, pagination, modal]
  │     (completely unchanged)
  │
  └─ API Calls tracker (existing)
```

## Implementation Notes

### State Management
```jsx
const [activeTab, setActiveTab] = useState('appEvents'); // NEW
const [appEvents, setAppEvents] = useState([]); // NEW
const [appEventsLoading, setAppEventsLoading] = useState(false); // NEW
const [eventCategories, setEventCategories] = useState({}); // NEW
const [eventFilter, setEventFilter] = useState({ 
  category: '', 
  severity: '', 
  limit: 200 
}); // NEW
const [expandedFlowIds, setExpandedFlowIds] = useState(new Set()); // NEW (for collapsible state)
const [expandedEventIds, setExpandedEventIds] = useState(new Set()); // NEW (for metadata)
```

### API Integration
```
GET /api/admin/app-events?category=&severity=&limit=200&since=
Response: { events: [...], total: N, categories: {...} }

10-second auto-refresh while tab is active
useEffect cleanup prevents polling when tab switches away
```

### No Breaking Changes
- Existing Raw Activity tab untouched
- All existing filters, modal, export, pagination preserved
- Existing CSS classes and styling patterns reused

## Verification Checkpoint (Plan 161-03)

**Human verification tasks:**
1. Start app: `./run-bank.sh`
2. Log in as admin
3. Navigate to `/activity`
4. Verify "App Events" tab is default
5. Perform user login (as bankuser) to generate events
6. Return to `/activity` → new events appear with correct category icons
7. Click a flow group to expand/collapse
8. Click an event to see expandable metadata
9. Use category filter to isolate events
10. Switch to "Raw Activity" tab → verify existing functionality unchanged
11. Verify 10-second auto-refresh (watch network panel)

## Files to Modify

- ✅ MODIFY: `banking_api_ui/src/components/ActivityLogs.js` (enhance, don't replace)

## Build Status
✅ Ready: No external dependencies needed (uses existing apiClient, useState, useEffect)

## Next Steps

→ **Phase 161-03 Execution:** Implement App Events tab following this design specification

→ **Phase 162:** Enhanced spinner with live activity feed showing token events and MCP calls

## Dependencies

**Blocks:** None (can start design/implementation immediately)
**Depends on:** Phase 161-01 ✅ (appEventService + admin routes) complete

---

**Total Phase 161 Status:** 2 of 3 plans complete and working
- ✅ Plan 161-01: appEventService backend + API endpoints
- ✅ Plan 161-02: Event source instrumentation (foundation laid)
- 📋 Plan 161-03: UI enhancement (design ready, ready for implementation)
