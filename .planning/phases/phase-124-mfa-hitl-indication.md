# Phase 124: MFA HITL Indication

## Description
Add clear Human-in-the-Loop (HITL) indication to MFA prompts so users understand when they need to manually approve a transaction. This improves user experience by making it explicit that certain transactions require manual MFA approval rather than automatic processing.

## Context
Phase 122 implemented conditional step-up authentication for high-value transactions. When the transaction amount exceeds the threshold (configured via STEP_UP_AMOUNT_THRESHOLD), the system triggers MFA. However, the current UI doesn't clearly indicate to users that this is a HITL scenario requiring their manual approval.

## Dependencies
- Phase 122 (conditional-step-up-authentication) — MFA step-up flow must be in place
- Phase 52 (pingone-mfa-step-up) — PingOne MFA integration must be functional

## Deliverables
- Update MFA prompt UI to include clear HITL indicator text
- Add visual cue (icon, badge, or banner) indicating HITL status
- Update transaction approval flow to show HITL state
- Add education panel explaining HITL concept
- Update SessionReauthBanner to include HITL context when relevant
- Test HITL indication across different transaction types (deposits, transfers, payments)

## Estimated Duration
2-4 hours

## Success Criteria
1. MFA prompt clearly indicates HITL status with text like "Manual approval required"
2. Visual cue (icon/badge) distinguishes HITL from automatic MFA
3. Users understand they need to manually approve the transaction
4. Education panel explains HITL concept in context
5. HITL indication works for all step-up MFA scenarios
6. UI contract preserved (no breaking changes to existing MFA flow)
