---
phase: 98-update-diagrams-and-docs-to-reflect-new-token-validation-options-including-introspection-vs-local-jwt-selection
plan: "01"
subsystem: docs
tags: [mermaid, architecture, introspection, jwt, token-validation, rfc7662, rfc7519]

requires: []
provides:
  - Updated architecture.mmd with ConfigPage, ValidationMode, ValidationRoutes, IntrospectionHealth nodes and their connections
  - Updated ARCHITECTURE.md with §1b Configurable Token Validation Modes table and key files list
  - Updated README.md token validation row to show runtime-switchable modes

affects: [architecture, docs, token-validation]

tech-stack:
  added: []
  patterns:
    - "architecture.mmd: new nodes follow existing classDef/subgraph conventions"
    - "ARCHITECTURE.md: §1b section pattern for Phase-specific feature documentation"

key-files:
  created: []
  modified:
    - architecture.mmd
    - ARCHITECTURE.md
    - README.md

key-decisions:
  - "Added S11 to Standards legend to call out configurable validation as a Phase 97 feature"
  - "Kept existing AuthMW → JWKS connection; added parallel introspection mode connection"

patterns-established:
  - "New BFF-level validation options documented alongside MCP-level RFC 7662 usage"

requirements-completed: []

duration: 15min
completed: 2026-04-08
---

# Phase 98-01: Mermaid + Markdown Docs Update Summary

**Architecture diagram and key markdown docs now reflect that token validation is a runtime-configurable choice (introspection vs JWT) — not a fixed behavior.**

## What Was Built

- **architecture.mmd**: Added `ConfigPage` (UI), `ValidationMode` (RuntimeSettings subgraph), `ValidationRoutes`, `IntrospectionHealth` nodes plus connections showing the config flow and dual validation paths. Added `S11` to Standards legend. Applied correct classDefs.
- **ARCHITECTURE.md**: Replaced single `Token Introspection (RFC 7662) on MCP server` row with three rows (BFF introspection mode, BFF JWT mode, MCP server). Added §1b Configurable Token Validation Modes with comparison table, key files, and link to `docs/INTROSPECTION_VALIDATION_GUIDE.md`.
- **README.md**: Updated token validation comparison row from static description to runtime-switchable description with env var and Config UI info.

## Verification

- `grep -c "validationModeConfig\|ValidationMode\|IntrospectionHealth\|ValidationRoutes\|ConfigPage" architecture.mmd` → 8
- `grep -c "Configurable Token Validation\|introspection.*default\|validationModeConfig\|INTROSPECTION_VALIDATION_GUIDE" ARCHITECTURE.md` → 5
- README.md line 61 shows `Runtime-switchable` with both modes documented

## Commit

- 2cdd83d — docs(98-01): update architecture.mmd, ARCHITECTURE.md, README.md with token validation modes
---
