# Phase 122: Conditional Step-Up Authentication for Banking Transactions

## Description

Implement conditional authentication flow for banking transactions where:
- **Logged-in users**: Only require MFA (step-up authentication) for banking transactions
- **Non-logged-in users**: Require both login and MFA for banking transactions

This phase ensures that users who are already authenticated don't need to re-authenticate (login) before performing banking operations - they only need step-up MFA for high-value transactions. Users who are not logged in must complete the full authentication flow (login + MFA) before any banking operation.

## Dependencies

- Phase 1: auth-flows (OAuth login flows must be working)
- Phase 100: configurable-step-up-mfa-threshold (MFA threshold configuration)
- Phase 94: explicit-hitl-for-agent-consent (HITL consent gates)

## Deliverables

- Conditional authentication logic in BankingAgent component
- Session state check before requiring login
- MFA-only flow for authenticated users
- Full login + MFA flow for unauthenticated users
- UI updates to reflect conditional auth requirements
- Documentation of the conditional auth flow

## Estimated Duration

2-3 days

## Success Criteria

1. Logged-in users performing banking transactions are prompted for MFA only (not login)
2. Non-logged-in users performing banking transactions are prompted for login first, then MFA
3. Session state is properly checked before determining auth requirements
4. Step-up MFA threshold is respected for both flows
5. No regression in existing authentication flows
6. UI clearly communicates which auth step is required (login vs MFA)
