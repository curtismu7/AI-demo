---
phase: 48
plan: 1
name: remove-invalid-spel-act-expression
type: sequential
wave: 1
depends_on: []
autonomous: true
files_modified:
  - docs/PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md
  - .planning/todos/pending/2026-04-03-fix-invalid-spel-act-expression-on-super-banking-banking-api-resource.md
  - .planning/todos/done/2026-04-03-fix-invalid-spel-act-expression-on-super-banking-banking-api-resource.md
requirements: []
---

# Phase 48 Plan 1: Remove Invalid SpEL act Expression from Step 1e

## Objective

Remove the invalid SpEL `act` attribute expression from Step 1e of `PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md` and replace it with correct guidance stating that no mapping is needed and that `act` chain construction is handled natively by PingOne during token exchange, with enforcement at BFF/PAZ layer.

## Context

- **File:** `docs/PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md`
- **Section:** Step 1e — Super Banking Banking API → Attribute Mappings tab
- **Invalid expression:** `#root.context.requestData.subjectToken?.act?.sub != null ? #root.context.requestData.subjectToken?.act : null`
- **Why invalid:** PingOne SpEL cannot navigate nested Map entries via `?.`; `subjectToken?.act?.sub` always returns null. PingOne also does not support inline Map construction (`{'key': value}` syntax).
- **What actually happens:** PingOne natively sets `act.sub = MCP client_id` and nests the previous `act` as `act.act` during Exchange #2 (RFC 8693 §4.4 standard behavior). No expression needed.
- **BFF enforcement:** `_performTwoExchangeDelegation()` in `agentMcpTokenService.js` verifies `finalClaims?.act?.sub && finalClaims?.act?.act?.sub` and records both in the `two-ex-final-token` tokenEvent.
- **Todo to resolve:** `.planning/todos/pending/2026-04-03-fix-invalid-spel-act-expression-on-super-banking-banking-api-resource.md`

## Tasks

### Task 1: Read current Step 1e content

type: auto

<read_first>
- docs/PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md (lines 400–470 — the full Step 1e section)
</read_first>

<action>
Read lines 400–470 of `docs/PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md` to confirm the exact text of the current **Attribute Mappings tab** section in Step 1e before editing. Specifically confirm:
1. The mapping table header: `**Attribute Mappings tab — \`act\` claim for Exchange #2 output:**`
2. The table rows: `act` attribute, expression field, Required = ✅ Yes
3. The "Expression explained" blockquote
4. The "PingOne SpEL limitation" blockquote
5. The "How to test" blockquote with JSON
6. The exact line where the **Scopes tab** section begins (to know where to stop the replacement)
</action>

<acceptance_criteria>
- Executor has confirmed the exact start line of the Attribute Mappings section in Step 1e
- Executor has confirmed the exact end line (start of Scopes tab section)
- Executor has confirmed the invalid expression text: `#root.context.requestData.subjectToken?.act?.sub != null`
</acceptance_criteria>

---

### Task 2: Replace invalid Attribute Mappings section in Step 1e

type: auto

<read_first>
- docs/PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md (Step 1e section, confirmed in Task 1)
- .planning/phases/48-remove-invalid-spel-act-expression-from-super-banking-banking-api-and-enforce-act-chain-at-bff-paz-layer-instead-update-docs/48-CONTEXT.md (replacement content decision)
</read_first>

<action>
Using `replace_string_in_file`, replace the entire Attribute Mappings tab block in Step 1e.

**Old content to replace** (everything from the Attribute Mappings heading through the "How to test" block, stopping before the Scopes tab section):

```
**Attribute Mappings tab — `act` claim for Exchange #2 output:**

| Field | Value |
|-------|-------|
| **Attribute name** | `act` |
| **Expression** | `#root.context.requestData.subjectToken?.act?.sub != null ? #root.context.requestData.subjectToken?.act : null` |
| **Required** | ✅ Yes |

> **Expression explained:** This forwards the `act` claim from the Agent Exchanged Token (Exchange #1 output) into the final MCP Exchanged Token. The result is `{ "sub": "<AI_AGENT_CLIENT_ID>" }` — showing that the AI Agent initiated the delegation chain on behalf of the user.
>
> **PingOne SpEL limitation:** PingOne does not support inline object/map construction (`{'key': value}` syntax) in attribute expressions. As a result, the fully nested RFC 8693 §5.4 structure `{ "sub": "<MCP_CLIENT_ID>", "act": { "sub": "<AI_AGENT_CLIENT_ID>" } }` is not achievable as a single expression. The expression above returns the AI Agent's identity as `act.sub`, which preserves the delegation proof. The BFF's `two-ex-final-token` tokenEvent log records both actors separately.

> **How to test:**
> ```json
> {
>   "context": {
>     "requestData": {
>       "subjectToken": {
>         "act": { "sub": "<AI_AGENT_CLIENT_ID>" }
>       },
>       "actorToken": {
>         "aud": ["<MCP_CLIENT_ID>"]
>       }
>     }
>   }
> }
> ```
> Expected result:
> ```json
> { "sub": "<AI_AGENT_CLIENT_ID>" }
> ```
```

**New content to insert:**

```
**Attribute Mappings tab:**

No custom mapping needed. Leave this tab unchanged.

> **Why not here?** PingOne automatically constructs the nested `act` claim during Exchange #2 — no attribute expression is needed. The outer `act.sub` is set to the MCP Service's `client_id` (the exchanger), and the inner `act.act` is promoted from the `act` claim on the Agent Exchanged Token (preserving the AI Agent's identity from Exchange #1). This is standard RFC 8693 §4.4 behavior.
>
> **PingOne SpEL limitation (for reference):** If you try to write a custom `act` expression on this resource server, it will fail. PingOne's SpEL evaluator cannot navigate nested Map entries via `?.` safe navigation (the `act` claim is a JSON object — `subjectToken?.act?.sub` returns null). Additionally, PingOne SpEL does not support inline Map construction (`{'key': value}` syntax), so the RFC 8693 §5.4 nested structure cannot be produced as an expression.
>
> **Where the chain is enforced:** The BFF's `_performTwoExchangeDelegation()` decodes the Final Token and verifies `act.sub` (MCP Service) and `act.act.sub` (AI Agent) are both present. PAZ enforces these as named policy attributes during token introspection.
```
</action>

<acceptance_criteria>
- `grep "Attribute Mappings tab" docs/PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md` does NOT match `act claim for Exchange #2 output`
- `grep "act?.sub != null" docs/PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md` returns no results
- `grep "No custom mapping needed" docs/PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md` returns a match in the Step 1e section
- `grep "RFC 8693 §4.4 behavior" docs/PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md` returns a match
- `grep "Where the chain is enforced" docs/PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md` returns a match
- The Scopes tab section immediately follows the new content (no orphaned blockquotes or tables between them)
</acceptance_criteria>

---

### Task 3: Commit the doc change

type: auto

<read_first>
- docs/PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md (verify edit is correct before committing)
</read_first>

<action>
Stage and commit only `docs/PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md`:

```bash
git add docs/PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md
git commit -m "docs(48): remove invalid SpEL act expression from Step 1e Super Banking Banking API

- Remove act Attribute Mapping table with invalid SpEL expression
- Remove Expression explained and PingOne SpEL limitation blockquotes
- Remove How to test block referencing invalid expression  
- Replace with: no mapping needed, PingOne handles act nesting natively (RFC 8693 §4.4)
- Add SpEL limitation note for reference (why expression would fail if attempted)
- Add BFF/PAZ enforcement note pointing to _performTwoExchangeDelegation()"
```
</action>

<acceptance_criteria>
- `git log --oneline -1` shows the commit message containing `remove invalid SpEL act expression`
- `git show --stat HEAD` shows only `docs/PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md` modified
</acceptance_criteria>

---

### Task 4: Move todo to done

type: auto

<read_first>
- .planning/todos/pending/2026-04-03-fix-invalid-spel-act-expression-on-super-banking-banking-api-resource.md (confirm it exists before moving)
</read_first>

<action>
Move the resolved todo from pending to done:

```bash
mkdir -p .planning/todos/done
mv .planning/todos/pending/2026-04-03-fix-invalid-spel-act-expression-on-super-banking-banking-api-resource.md \
   .planning/todos/done/2026-04-03-fix-invalid-spel-act-expression-on-super-banking-banking-api-resource.md
```

Then commit via gsd-tools:
```bash
node "$HOME/.copilot/get-shit-done/bin/gsd-tools.cjs" commit "docs(48): mark fix-invalid-spel-act-expression todo as done" \
  --files ".planning/todos/done/2026-04-03-fix-invalid-spel-act-expression-on-super-banking-banking-api-resource.md"
```
</action>

<acceptance_criteria>
- `ls .planning/todos/pending/ | grep "fix-invalid-spel"` returns no results
- `ls .planning/todos/done/ | grep "fix-invalid-spel"` returns the file
- `git log --oneline -1` shows the todo cleanup commit
</acceptance_criteria>

---

## Verification

```bash
# 1. Invalid expression no longer in doc
grep "act?.sub != null" docs/PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md && echo "FAIL: expression still present" || echo "PASS: expression removed"

# 2. New content is present
grep -c "No custom mapping needed\|RFC 8693 §4.4 behavior\|Where the chain is enforced" docs/PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md

# 3. Scopes tab still intact after Step 1e Attribute Mappings section
grep -A 2 "Leave this tab unchanged" docs/PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md | grep -q "Scopes tab" && echo "PASS: Scopes tab follows" || echo "CHECK: verify Scopes tab position manually"

# 4. Todo moved
[ -f ".planning/todos/done/2026-04-03-fix-invalid-spel-act-expression-on-super-banking-banking-api-resource.md" ] && echo "PASS: todo in done" || echo "FAIL: todo not in done"
```

## Success Criteria

- [ ] `docs/PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md` Step 1e has no invalid SpEL expression
- [ ] Replacement content explains "No mapping needed" + why (RFC 8693 §4.4) + SpEL limitation note + BFF/PAZ enforcement
- [ ] Scopes tab section and rest of Step 1e unchanged
- [ ] Doc change committed with descriptive message
- [ ] SpEL fix todo moved to `.planning/todos/done/`

## must_haves

- The invalid expression `#root.context.requestData.subjectToken?.act?.sub != null` is completely removed from the doc
- The replacement clearly states PingOne handles `act` nesting natively — no expression needed
- No other sections of the doc are modified
