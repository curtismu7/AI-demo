---
phase: 4
reviewers: [claude]
reviewed_at: 2026-04-01T13:46:21Z
plans_reviewed:
  - 04-01-PLAN.md
  - 04-02-PLAN.md
  - 04-03-PLAN.md
  - 04-04-PLAN.md
---

# Cross-AI Plan Review — Phase 4 (education-content)

## Claude Review

### 1. Summary

Phase 4 is well-structured with sensible wave ordering and good separation of concerns across four plans. The goal of making every major concept self-explanatory within the browser is achievable with this approach. The main risks are (1) a potentially misleading spec name ("OIDC 2.1") that could teach attendees incorrect attributions, (2) an underspecified tour navigation model that could fail a presenter mid-demo, and (3) a tab-count discrepancy in 04-02 that hints at in-progress state leaking into the plan doc. None are blockers individually, but the spec accuracy issue should be resolved before the panels ship since the demo is explicitly educational.

---

### 2. Strengths

- **Wave ordering is sound.** Panels (Wave 1) → cross-links and tour (Wave 2) → polish (Wave 3) respects content-before-navigation dependencies. 04-01 and 04-02 are genuinely independent within Wave 1.
- **"In this repo" tab in 04-02** is excellent. Showing real source file paths directly in the education panel is the highest-value thing a live demo can do — it collapses the gap between explanation and code.
- **Marketing dock isolation** in 04-04 is correctly scoped to `.App--marketing-page`, which protects the dashboard from unintended styling drift.
- **DemoTourContext design** (context provider + `useDemoTour` hook + `TOUR_STEPS` constant array) is the right React pattern. Keeping step data in one array makes reordering steps safe.
- **Build verification** is required explicitly in every plan — good discipline, prevents plans from being marked done without a passing build.
- **Grep-before-write in 04-02** (Task 1 confirms source file paths before authoring the "In this repo" table) prevents the panel from shipping with stale or invented file paths.

---

### 3. Concerns

**PLAN 04-01 — OIDC 2.1 content accuracy**

- **[HIGH] "OIDC 2.1" is not a published or ratified spec.** The features described — PKCE mandatory, implicit flow removed, nonce tightened — belong to **OAuth 2.1** (IETF draft `draft-ietf-oauth-v2-1`) and the **OAuth 2.0 Security BCP** (`RFC 9700`). There is a draft "OpenID Connect Core 2.0" in the OpenID Foundation, but it has no finalized spec number and does not carry the label "OIDC 2.1." A conference audience of developers who look this up afterward and find no such spec will distrust the whole demo. This must be resolved before shipping.
- **[MEDIUM] "Implicit removed" is slightly overstated.** OAuth 2.1 omits the implicit grant from its consolidated text but does not formally deprecate existing implementations — existing OIDC Core hybrid flows still reference `response_type=token`. The panel should clarify "not recommended / omitted from best-practice guidance" rather than "removed."
- **[LOW] "Resource indicators for audience scoping"** is RFC 8707, not an OIDC 2.1 feature. Cross-referencing is fine, but the panel shouldn't attribute RFC 8707 to "OIDC 2.1."

**PLAN 04-02 — MCP panel tab count**

- **[MEDIUM] "Total tab count: 6 (was 4 before this phase, edits in this session made it 7)"** is confusing. "Edits in this session" implies the plan was written during an active coding session and the count is uncertain. The plan must state the final target (6 tabs) and list all tab names explicitly so the executor doesn't have to infer. If the tab count actually became 7, the must-have check fails.
- **[LOW] MCP 2025-11-25 auth challenge attribution.** The spec defines auth challenges via OAuth 2.0 metadata discovery and dynamic client registration (§2.3 of the MCP spec). The three trigger scenarios described (amount threshold → CIBA, first high-risk tool → Authorize gate, session loss → inline login) are this repo's implementation choices, not part of the MCP spec itself. The panel should clearly distinguish "what the MCP spec defines" from "how this demo implements it," or it risks misrepresenting the spec to educators.

**PLAN 04-03 — Demo tour UX and CIBA step**

- **[HIGH] CIBA step requires live phone hardware.** Step 4 ("CIBA flow — out-of-band phone approval trigger") describes an action that requires a real PingOne CIBA push notification to a physical device. At a conference, if the presenter's phone isn't enrolled or the notification is slow, the tour stalls. The plan has no fallback — no "skip CIBA if unavailable" path, no mocked state, no "what you'd see" description mode. Either add a fallback for the CIBA step or document a pre-demo setup checklist.
- **[MEDIUM] Tour navigation model is underspecified.** The plan says "React Router Link for route actions" but does not define whether the modal triggers automatic route transitions or only displays "navigate to /dashboard" hints for the presenter to follow. For a 5-minute live demo, ambiguity here causes presenters to click Next and find themselves on the wrong route. Define: does the modal navigate? If so, which steps?
- **[MEDIUM] Progress bar color is "4px red."** Red carries error/failure semantics in most design systems. If the app's brand color is navy/blue, the progress bar should use that. A red bar on a live demo reads as an error state to audience members who glance at it.
- **[LOW] No left/right arrow key navigation.** Escape closes (good), but conference presenters typically want to advance slides with a clicker or arrow keys. Consider `ArrowRight`/`ArrowLeft` listeners in the modal.
- **[LOW] Step 8 (tour complete) links to "education panels" without specifying which route or panel ID.** This should be pinned to a specific route + panel (e.g., `/#edu-overview`) so it doesn't break if routes change.

**PLAN 04-04 — Audit task definition**

- **[LOW] Task 1 ("read-only audit") has no defined output.** If the audit reveals more issues than anticipated, there's no decision rule for what to fix vs. defer. Add a brief scope bound: "fix only font-size and hard-coded color issues; defer layout restructuring."

---

### 4. Suggestions

- **Rename "OIDC 2.1" to "OAuth 2.1 + OIDC Security Best Practices"** in 04-01, or frame the panel as "Modern OIDC: OAuth 2.1 and the Security BCP" with explicit RFC numbers (OAuth 2.1 draft, RFC 9700) rather than a version label. This is more accurate and more useful to developers who will search for these documents.
- **In 04-02**, list all six target tab names in the must-haves (e.g., Overview, Protocol lifecycle, Tool call flow, Auth challenge, In this repo, ?). This removes ambiguity about the final state.
- **In 04-03 Task 3**, add a `data-tour-step` attribute on key UI elements (login button, FAB, token inspector toggle). This lets the modal draw attention to the right element without requiring the presenter to scroll or hunt. It also makes the tour verifiable in tests.
- **Add a tour pre-flight checklist** to 04-03 must-haves: the phase is marked done only if a presenter can run steps 0–8 without manual detours. Without this, the tour works in unit tests but fails in a live setting.
- **In 04-04**, explicitly state which CSS custom properties or design tokens define the marketing palette (navy, white, shadow values). Hardcoding hex values in the override block will diverge if the marketing palette is ever updated.

---

### 5. Risk Assessment

**Overall: MEDIUM**

The wave structure and individual plans are solid. The spec accuracy issue in 04-01 is the highest-priority risk — incorrect attribution of OAuth 2.1 changes to "OIDC 2.1" would be actively harmful for an educational demo shown to developers at conferences. The CIBA tour step has a realistic failure mode in a live setting. Both are fixable before execution without significant replanning. The remaining concerns (tab count, progress bar color, tour navigation model) are low-friction to address at plan-time but would require backtracking if caught post-implementation.

---

## Consensus Summary

*(Single reviewer — no cross-model consensus available. Run `/gsd:review 04 --gemini` or `--codex` to add additional reviewers.)*

### Key Concerns (by severity)

| Severity | Plan | Concern |
|----------|------|---------|
| HIGH | 04-01 | "OIDC 2.1" is not a published spec — content should reference OAuth 2.1 draft + RFC 9700 instead |
| HIGH | 04-03 | CIBA tour step requires live phone hardware with no fallback path |
| MEDIUM | 04-01 | "Implicit removed" is overstated — should say "omitted from guidance / not recommended" |
| MEDIUM | 04-02 | Tab count discrepancy (plan says 6, note says 7) — must-have check is ambiguous |
| MEDIUM | 04-02 | Auth challenge scenarios are demo-specific, not MCP spec — panel must distinguish |
| MEDIUM | 04-03 | Tour navigation model (auto-route vs. hint) not defined |
| MEDIUM | 04-03 | Red progress bar carries error semantics — consider brand color |
| LOW | 04-01 | RFC 8707 (resource indicators) should not be attributed to "OIDC 2.1" |
| LOW | 04-03 | No left/right arrow key navigation for presenter clicker |
| LOW | 04-03 | Step 8 "explore education panels" link not pinned to a specific panel ID |
| LOW | 04-04 | Audit task has no scope bound — no rule for what to fix vs. defer |

### Top Action Items Before Re-Execution

1. **Reframe 04-01 panel** as "OAuth 2.1 & Modern OIDC Best Practices" — cite IETF draft + RFC 9700 explicitly
2. **Add CIBA fallback** to 04-03 tour step 4 — either a "demo mode" skip or a pre-flight checklist in must-haves
3. **Clarify navigation model** in 04-03 — state explicitly whether tour modal auto-navigates routes
