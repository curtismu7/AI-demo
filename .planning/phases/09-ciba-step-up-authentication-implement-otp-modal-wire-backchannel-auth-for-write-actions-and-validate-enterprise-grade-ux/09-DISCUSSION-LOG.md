# Phase 09 — Discussion Log

**Date:** 2026-04-03
**Method:** Interactive discuss-phase

---

## Area A: Agent unblocking — how should step-up auto-initiate?

**Question:** When agent gets a 428, should the step-up be fully automatic (no user awareness), have a brief countdown + cancel, or always require a button click?

**Options presented:**
1. Fully automatic (no countdown, immediate initiation)
2. 3-second countdown + Cancel button — auto-initiates unless user cancels
3. Keep manual button click (no auto-initiate)

**Answer:** Option 2 — 3-second countdown + Cancel

**Decision locked:** D-01

---

## Area B: Scope of 428 triggers — which agent actions require step-up?

**Question:** Should `get_sensitive_account_details` (account number, routing number) require step-up? Should the threshold be configurable?

**Options presented:**
1. High-value transactions only (keep current ~$250 threshold, hardcoded)
2. High-value transactions only, but threshold configurable in Admin Config
3. Both high-value transactions AND `get_sensitive_account_details`, threshold configurable

**Answer:** Option 3 — both triggers, threshold configurable

**Decisions locked:** D-02, D-03

---

## Area C: OTP/email parity and default method

**Question:** Should OTP get the same auto-initiate behavior? Which method should be default?

**Sub-question 1:** Should OTP/email have symmetric 3s countdown + cancel?

**Answer:** Yes — symmetric behavior (D-04). Method-specific messages in agent thread (D-05).

**Sub-question 2:** Which should be the default `step_up_method`?

**Options:**
1. Keep CIBA as default
2. Change to OTP/email as default (CIBA opt-in)

**Answer:** OTP/email as default (D-06)

**Decisions locked:** D-04, D-05, D-06

---

## Area D: Approval notification UX

**Question:** What should the completion moment look like?

**Options presented:**
1. Fix the stale toast message only ("Identity verified — resuming agent request…")
2. Add a distinct agent confirmation card only (✅ [Method] approved — continuing your request)
3. Both — fix the toast + distinct agent confirmation card

**Answer:** Both (option 3)

**Decision locked:** D-07

---

## Summary of All Decisions

| ID | Decision |
|----|---------|
| D-01 | Auto-initiate CIBA/OTP with 3-second countdown + Cancel button when agent triggers step-up |
| D-02 | `get_sensitive_account_details` triggers 428 step-up; replaces `SensitiveConsentBanner` |
| D-03 | Step-up threshold configurable in Admin Config (`step_up_threshold`), default $250 |
| D-04 | OTP/email gets same 3s auto-initiate + Cancel treatment (symmetric with CIBA) |
| D-05 | Method-specific agent messages: "CIBA push sent to your device…" vs "Email OTP sent to [email]…" |
| D-06 | Default `step_up_method` changes from `'ciba'` to `'email'` |
| D-07 | Fix stale toast ("resuming agent request…") AND add agent confirmation card before retry |
