# Phase 161: Add Thin Activity Log — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-15
**Phase:** 161-add-thin-activity-log
**Areas discussed:** Event selection, Display location, Event formatting, Audience
**Mode:** Auto-decided (hook-forced completion — no interactive user input captured)

---

## Event Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Core identity events only | JWKS, OAuth, token exchange, session | ✓ |
| All server events | Include DB queries, middleware, etc. | |
| Client + server events | Capture frontend events too | |

**User's choice:** Auto-selected — Core identity events (JWKS, OAuth, token exchange, session, MCP tools)
**Notes:** Phase title explicitly names these event types. Raw polling endpoints excluded as noise.

---

## Display Location

| Option | Description | Selected |
|--------|-------------|----------|
| Enhance existing /activity page | Build on 584-line ActivityLogs component | ✓ |
| New dashboard widget | Compact inline panel | |
| Replace API traffic panel | Swap apiTrafficStore for curated events | |

**User's choice:** Auto-selected — Enhance existing /activity admin page
**Notes:** Existing component has filters, pagination, modal detail view. Enhancement is lower risk than replacement.

---

## Event Formatting

| Option | Description | Selected |
|--------|-------------|----------|
| Timeline with icons + flow grouping | Category icons, collapsible flow groups | ✓ |
| Plain chronological list | Simple severity-tagged list | |
| Card-based dashboard | Event cards with expandable details | |

**User's choice:** Auto-selected — Timeline with category icons and flow grouping
**Notes:** Aligns with educational/demo purpose — showing how identity flows connect.

---

## Audience

| Option | Description | Selected |
|--------|-------------|----------|
| Admin-only (existing gate) | Behind AdminRoute, educational focus | ✓ |
| Admin + simplified user view | Separate view for regular users | |

**User's choice:** Auto-selected — Admin-only
**Notes:** Keeps existing AdminRoute gate. End-user view deferred.

---

## Claude's Discretion

- Event retention policy, icon/color choices, filter UI, internal data structures

## Deferred Ideas

- Dashboard widget, end-user activity log, persistent storage, WebSocket streaming
