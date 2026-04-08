---
phase: 98-update-diagrams-and-docs-to-reflect-new-token-validation-options-including-introspection-vs-local-jwt-selection
plan: "02"
subsystem: docs
tags: [drawio, architecture, introspection, jwt, token-validation, diagrams]

requires: []
provides:
  - New docs/token-validation-flow.drawio diagram showing both validation paths with operator config flow, decision diamond, introspection branch, JWT branch, health check panel, and converging scopes enforcement
  - Updated Banking-Architecture.drawio with validationModeConfig.js node, Token Validation Tab config node, and their connecting edge

affects: [architecture, docs, token-validation, diagrams]

tech-stack:
  added: []
  patterns:
    - "draw.io XML format for all new diagrams (user preference: never Mermaid for new diagrams)"
    - "Color scheme: external/PingOne=#e8f4fd/#2980b9, BFF=#fef9e7/#f39c12, Config/UI=#eafaf1/#27ae60"

key-files:
  created:
    - docs/token-validation-flow.drawio
  modified:
    - Banking-Architecture.drawio

key-decisions:
  - "Used standalone draw.io XML (not embedded in swimlane parent) for token-validation-flow to match repo convention"
  - "Placed new Banking-Architecture.drawio nodes at x=300,y=500 (below BFF swimlane) to avoid overlap"

patterns-established:
  - "New flow diagrams live in docs/*.drawio"

requirements-completed: []

duration: 15min
completed: 2026-04-08
---

# Phase 98-02: draw.io Diagrams Summary

**Created a new customer-facing draw.io token validation flow diagram and updated the architecture diagram to include the mode configuration node.**

## What Was Built

- **docs/token-validation-flow.drawio**: Full draw.io XML showing the two BFF token validation paths. Includes: operator config flow (Config Page → POST /api/config/validation-mode → validationModeConfig.js), API request decision diamond (introspection vs JWT), right branch (RFC 7662 introspection with cache), left branch (RFC 7519 JWT local verify), health check side panel (GET /api/health/introspection), and both paths converging into requireScopes middleware.
- **Banking-Architecture.drawio**: Added `validationModeConfig.js` node (BFF yellow style), `Config: Token Validation Tab` node (green style), and a `mode switch` edge connecting them. Inserted as standalone nodes below the BFF swimlane (3 new mxCells, total 63 → was 60).

## Verification

- `grep -c "validationMode\|tokenValidationTab" Banking-Architecture.drawio` → 3
- `grep -c "introspection\|validationMode\|RFC 7662" docs/token-validation-flow.drawio` → 7
- Both files start with `<?xml version="1.0"` / `<mxfile` — valid draw.io XML
- Neither file contains "flowchart" or "graph TB" (confirmed not Mermaid)

## Commits

- 853039c — docs(98-02): add token-validation-flow.drawio and update Banking-Architecture.drawio
