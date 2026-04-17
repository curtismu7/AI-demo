# Phase 181: Add Training Slide-Out for CUA for AI — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-17
**Phase:** 181-we-need-to-add-a-training-slide-out-for-cua-for-ai
**Areas discussed:** Content scope & structure, Panel trigger & navigation, Visual content approach, Relationship to existing panels

---

## Content Scope & Structure

| Option | Description | Selected |
|--------|-------------|----------|
| 3 tabs | "What is CUA?", "How it works", "CUA vs MCP" | |
| 4 tabs | "What is CUA?", "How it works", "CUA vs MCP/tool-use", "Security & trust" | |
| 5 tabs | "What is CUA?", "How it works", "CUA vs MCP/tool-use", "Security & trust", "In this demo" | ✓ |
| You decide | Agent picks tab structure | |

**User's choice:** 5 tabs

---

## Panel Trigger & Navigation

| Option | Description | Selected |
|--------|-------------|----------|
| NL intent only | Add CUA keywords to SYSTEM prompt, no menu changes | |
| NL intent + RFC Index row | Keywords AND row in RFC Index panel | |
| NL intent + RFC Index + education menu | All of the above plus education side nav entry | ✓ |
| You decide | Agent picks integration points | |

**User's choice:** Full integration — NL intent + RFC Index + education menu entry

---

## Visual Content Approach

| Option | Description | Selected |
|--------|-------------|----------|
| Text-only | Prose, headers, bullets, code snippets | |
| Text + static diagram | Inline SVG/HTML diagram for CUA loop | ✓ |
| Text + comparison table | Side-by-side CUA vs MCP table | ✓ |
| You decide | Agent picks per tab | |

**User's choice:** Both — static diagram for "How it works" tab AND comparison table for "CUA vs MCP/tool-use" tab. Text for remaining tabs.

---

## Relationship to Existing Panels

| Option | Description | Selected |
|--------|-------------|----------|
| Inline cross-links | "See also" links within CUA panel only | |
| Dedicated "Related topics" section | Footer section listing related panels | |
| Bidirectional links | CUA links out + related panels link back to CUA | ✓ |
| You decide | Agent picks linking strategy | |

**User's choice:** Bidirectional cross-links — CUA panel links to Agent Gateway, Human-in-Loop, MCP Protocol; those panels get "See also: CUA" links back

---

## Agent's Discretion

- Exact prose content for each tab
- EDU id constant naming
- RFC Index row ordering
- Diagram styling details
- Placement of "See also" links in related panels

## Deferred Ideas

None
