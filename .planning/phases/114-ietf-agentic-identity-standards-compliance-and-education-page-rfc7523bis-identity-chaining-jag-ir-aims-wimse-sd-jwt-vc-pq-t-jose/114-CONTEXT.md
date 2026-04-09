# Phase 114 Context: IETF Agentic Identity Standards — Compliance + Education Page

## Source

Based on **Ping Identity's IETF Standards Stack for Agentic Identity** slide deck (April 2026, Confidential / For Trusted Partner Use Only).

---

## The 7 Standards to Cover

### From "Open Standards Stack for Agentic Identity"

| Standard | What It Defines | WG | Maturity | Ping Role |
|----------|-----------------|-----|----------|-----------|
| **RFC7523bis** | JWT Client Auth & Assertion Grants (Update) | OAuth WG | High | Co-author |
| **Identity Chaining + ID-JAG** | Cross-domain delegation + Identity Assertion JWT Grant (XAA is built on ID-JAG) | OAuth WG | Very High | Co-author |
| **JAG-IR** | JWT Grant Interaction Response — human-in-the-loop for agent flows | OAuth WG | Early | Co-author |
| **AI Agent Auth (AIMS)** | Comprehensive agent identity framework: WIMSE + OAuth 2.0 | Network WG | Early | Co-author |
| **WIMSE** | Workload Identity: Architecture, Credentials & S2S Protocol | WIMSE WG | Medium-High | Co-author |
| **SD-JWT VC** | Verifiable Digital Credentials — selective disclosure | OAuth WG | Very High | Co-author |
| **PQ/T JOSE** | Post-Quantum & Hybrid Algorithm Registrations for JWTs | JOSE WG | Medium | Co-author |

### From "5 IDC Guardrails: Each Mapped to an Active Standard"

| # | IDC Guardrail | Standard | Maturity |
|---|---------------|----------|----------|
| 01 | Verifiable credentials for repeatable, portable identity proofing | SD-JWT VC + OID4VCI + OID4VP | Near-RFC / Final |
| 02 | Delegated authorization with full audit trail across agent chains | Identity Chaining + ID-JAG + RFC 8693 Token Exchange | Very High |
| 03 | Explainability logs — every action traceable to its authorization decision | RFC 8693 nested act claims + Identity Chaining audit chain | Current / High |
| 04 | Real-time workload attestation and trust across system boundaries | WIMSE Workload Identity | Medium-High |
| 05 | Data provenance and cryptographic integrity of credentials | PQ/T JOSE Post-Quantum | Medium |

---

## What's Already Implemented in This Demo

| Standard | Current Implementation | Gap |
|----------|----------------------|-----|
| **RFC 8693 Token Exchange** | ✅ Full — 1-exchange + 2-exchange, may_act, act claims, RFC compliance test suite | None |
| **RFC7523 (current)** | ✅ Partial — JWT client auth patterns used in agent OAuth flows | No RFC7523bis update panel |
| **Identity Chaining / ID-JAG** | ⚠️ Partial — act claims form a delegation chain; cross-domain not demonstrated | No dedicated education panel |
| **JAG-IR (HITL for agents)** | ✅ Full — CIBA HITL flow implemented, consent modals, bankingAgent HITL flow | Needs mapping to JAG-IR framing |
| **WIMSE** | ❌ Not implemented — workload identity between BFF, MCP server, agent not using WIMSE credentials | Education panel only, or stub |
| **SD-JWT VC** | ❌ Not implemented — credentials currently standard JWTs | Education panel with roadmap note |
| **PQ/T JOSE** | ❌ Not implemented — current JWTs use RS256/ES256 | Education panel with roadmap note |
| **AIMS** | ⚠️ Partial — agent identity framework partially met via RFC 8693 + CIBA | Needs AIMS framing panel |

---

## Phase Goals

### Plan 01: `IETFStandardsPanel.js` — Education panel
- New education drawer following `BestPracticesPanel.js` pattern
- **7 tabs** (one per standard) + **overview tab** (IDC guardrail table)
- Each tab: What it is, current demo status (✅/⚠️/❌), how PingOne implements it, IETF draft link
- Tab IDs: `overview`, `rfc7523bis`, `identity-chaining`, `jag-ir`, `aims`, `wimse`, `sd-jwt-vc`, `pq-jose`

### Plan 02: Register panel + add SideNav entry
- Add `IETF_STANDARDS: 'ietf-standards'` to `educationIds.js`  
- Register `IETFStandardsPanel` in `EducationPanelsHost.js`
- Add to SideNav education commands list
- Add to `educationCommands.js`
- Surface "IETF Standards Stack" button from `BestPracticesPanel.js` guardrail 02 tab
- Add "Standards" badge/chip to relevant existing panels (Token Exchange → links to Identity Chaining; HITL → links to JAG-IR)

### Plan 03: Compliance status wiring on existing panels
- Add a small compliance callout to `TokenExchangePanel.js`: "This demo implements RFC 8693 §2.1 + §4, which fulfills IDC Guardrail 02 (Delegated authorization) and IDC Guardrail 03 (Explainability logs)"
- Add to `HumanInLoopPanel.js`: "CIBA in this demo implements the JAG-IR pattern for human-in-the-loop agent authorization"
- Update `BestPracticesPanel.js` practice 2 tab to link to IETF Standards panel
- Ensure all links build clean

---

## Key Integration Points

- `banking_api_ui/src/components/education/` — all existing panels
- `banking_api_ui/src/components/education/educationIds.js` — add `IETF_STANDARDS`
- `banking_api_ui/src/components/education/EducationPanelsHost.js` — register panel
- `banking_api_ui/src/components/education/educationCommands.js` — add to command palette
- `banking_api_ui/src/components/SideNav.js` — add education entry
- `banking_api_ui/src/components/education/TokenExchangePanel.js` — add IDC compliance callout
- `banking_api_ui/src/components/education/HumanInLoopPanel.js` — add JAG-IR callout
- `banking_api_ui/src/components/education/BestPracticesPanel.js` — add IETF panel links

---

## Panel UI Design

```
┌─────────────────────────────────────────────────────────┐
│ IETF Standards Stack for Agentic Identity               │
│ Ping Identity co-authors all 7 active drafts            │
│─────────────────────────────────────────────────────────│
│ [Overview] [RFC7523bis] [Identity Chaining] [JAG-IR]   │
│ [AIMS] [WIMSE] [SD-JWT VC] [PQ/T JOSE]                 │
│─────────────────────────────────────────────────────────│
│                                                         │
│  Overview tab — IDC Guardrail table (5 rows)           │
│  + "How this demo implements each guardrail"           │
│  + Ping maturity badges (color-coded)                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

Maturity badge colors (matching the slides):
- Very High / Near-RFC: Green (#16a34a)
- High / Current: Blue (#2563eb)  
- Medium-High: Orange-tinted (#d97706)
- Medium / Early: Yellow (#ca8a04)

---

## IETF Draft References

- RFC7523bis: https://datatracker.ietf.org/doc/draft-ietf-oauth-rfc7523bis/
- Identity Chaining + ID-JAG: https://datatracker.ietf.org/doc/draft-ietf-oauth-identity-chaining/
- JAG-IR: https://datatracker.ietf.org/doc/draft-ietf-oauth-jag-ir/
- AIMS: https://datatracker.ietf.org/doc/draft-ietf-wimse-ai-agent-auth/
- WIMSE: https://datatracker.ietf.org/doc/draft-ietf-wimse-workload-identity/
- SD-JWT VC: https://datatracker.ietf.org/doc/draft-ietf-oauth-sd-jwt-vc/
- PQ/T JOSE: https://datatracker.ietf.org/doc/draft-ietf-jose-post-quantum/

---

## Dependencies

- Depends on: Phase 108 (stable app base)
- No backend changes needed — pure frontend education panel
- Build must remain clean after all changes
