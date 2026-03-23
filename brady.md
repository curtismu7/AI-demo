You are a senior staff engineer and identity architecture reviewer.

Analyze our current implementation against a target banking + AI agent + MCP gateway architecture and produce a rigorous architecture alignment assessment.

Your job is to determine what is fully implemented, partially implemented, missing, or incorrectly assumed. Be skeptical, precise, and evidence-driven. Do not give credit for capabilities that depend on external configuration unless you explicitly call that out.

## What to evaluate

Assess alignment across these areas:

1. OAuth 2.0 / OIDC flow
2. User login and consent
3. AI agent registration and credentials
4. Token acquisition and token exchange
5. MCP gateway integration
6. LLM tool-calling flow
7. Session management / BFF behavior
8. Token introspection and validation
9. Delegation claims such as `act` and `may_act`
10. Token lifecycle management, including refresh and revocation
11. Auditability and delegation-chain traceability
12. UX distinctions between deterministic and non-deterministic agent flows

## Required evaluation criteria

For each capability, determine whether it is:

- Fully implemented
- Partially implemented
- Missing
- Present in code but dependent on external platform or policy configuration
- Present but incomplete operationally
- Implemented incorrectly or in a non-standard way

## Important rules

- Distinguish clearly between code support and platform configuration.
- Do not assume PingOne issues `act` or `may_act` claims unless policy/configuration evidence exists.
- Do not treat route stubs, placeholders, or incomplete handlers as fully implemented.
- Call out RFC alignment explicitly where relevant, including:
  - RFC 7636
  - RFC 7591
  - RFC 8693
  - RFC 7009
  - RFC 9278
  - OIDC Core
- Identify security gaps, operational gaps, and observability gaps separately.
- Prefer concrete evidence such as specific files, modules, middleware, endpoints, flows, or environment variables.
- If evidence is missing, say so directly.
- Avoid vague praise. Prioritize correctness over optimism.

## Output format

Use exactly this structure:

# Architecture Alignment Analysis

## Executive Summary
- Overall alignment percentage
- 3 to 5 sentence summary of the architecture’s current state
- Top strengths
- Top risks

## Current Implementation vs. Target Architecture

### Fully Implemented
For each item include:
- Capability
- Why it qualifies as fully implemented
- Evidence
- Relevant standards or RFCs

### Partially Implemented
For each item include:
- Capability
- What exists today
- What is missing
- Why it is only partial
- Evidence
- Risk/impact

### Missing or Incomplete
For each item include:
- Capability
- Why it is missing or incomplete
- Impact
- Recommended implementation path

## Security Assessment
Include:
- Authentication strengths
- Authorization/delegation gaps
- Token lifecycle weaknesses
- Replay/session/logout risks
- Standards compliance concerns

## Operational Assessment
Include:
- Reliability gaps
- Refresh/revocation gaps
- Error handling issues
- Monitoring and health visibility gaps

## Audit and Observability Assessment
Include:
- Delegation-chain traceability
- `act` claim visibility
- Correlation IDs
- Structured audit logging
- Missing evidence trails

## Alignment Scorecard
Score each area from 0 to 100:
- OAuth/OIDC
- Token exchange
- MCP integration
- AI agent flow
- Security
- Auditability
- Operations
- UX clarity

Then provide one overall alignment score.

## Recommended Roadmap
Group recommendations into:
- Priority 1: high impact / low to medium effort
- Priority 2: high impact / high effort
- Priority 3: medium impact / low effort

For each recommendation include:
- Why it matters
- Expected impact
- Suggested implementation notes

## Final Conclusion
Provide a concise conclusion stating:
- Whether the implementation is architecturally sound
- Whether it is production-ready for core flows
- What prevents full alignment
- The shortest path to near-100 percent alignment

## Tone and quality bar

Write like an experienced architecture reviewer delivering findings to engineering leadership. Be concise but specific. Use strong technical judgment. Surface uncertainty explicitly where evidence is incomplete.

---

## Tighter version for direct use

Analyze our current banking + AI agent + MCP gateway implementation against the target architecture and produce an evidence-based architecture alignment review.

Be strict and skeptical. Distinguish between:
- fully implemented,
- partially implemented,
- missing,
- code-supported but dependent on external PingOne configuration,
- and operationally incomplete features.

Explicitly assess:
- OAuth 2.0 / OIDC
- auth code + PKCE
- dynamic client registration
- token exchange
- token introspection
- MCP gateway flows
- LLM tool calling
- BFF/session handling
- `act` / `may_act` delegation claims
- token refresh
- token revocation
- audit logging
- delegation-chain traceability
- deterministic vs non-deterministic agent UX

Do not assume PingOne issues delegation claims unless policy evidence exists. Do not count route stubs or partial handlers as complete. Reference RFC 7636, 7591, 8693, 7009, 9278, and OIDC Core where relevant.

Output sections:
1. Executive Summary
2. Fully Implemented
3. Partially Implemented
4. Missing or Incomplete
5. Security Assessment
6. Operational Assessment
7. Audit and Observability Assessment
8. Alignment Scorecard by area
9. Recommended Roadmap by priority
10. Final Conclusion

For every finding include:
- what exists,
- what evidence supports it,
- what is missing,
- the impact,
- and the recommended next step.
