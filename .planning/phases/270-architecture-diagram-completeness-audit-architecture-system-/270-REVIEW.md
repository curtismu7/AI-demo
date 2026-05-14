---
phase: 270-architecture-diagram-completeness-audit
reviewed: 2026-05-14T00:00:00Z
depth: quick
files_reviewed: 7
files_reviewed_list:
  - banking_api_ui/src/components/__tests__/ArchitectureDiagram.completeness.test.js
  - banking_api_ui/src/components/education/InteractiveArchDiagram.js
  - scripts/build-diagrams.sh
  - architecture-simple.mmd
  - architecture.mmd
  - REGRESSION_PLAN.md
  - .planning/REQUIREMENTS.md
findings:
  critical: 0
  warning: 2
  info: 4
  total: 6
status: issues_found
---

# Phase 270: Code Review Report

**Reviewed:** 2026-05-14
**Depth:** quick
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Phase 270 is mostly documentation: two mermaid diagram updates, an APPEND-ONLY REGRESSION_PLAN row + §4 entry, REQ-DIAGRAM-01..15 in REQUIREMENTS.md, a one-character mermaid-cli version bump, a JSDoc comment block on `InteractiveArchDiagram.js`, and ONE real piece of code — the 166-line Jest sync test `ArchitectureDiagram.completeness.test.js`.

Programmatic checks confirm:

- All 8 SVC_LIST entries parse correctly from `run-bank.sh` (regex works against the actual file, which has tab/multi-space whitespace between names).
- All four `.mmd` sources contain **zero** glyphs in the emoji ranges the test scans (`U+1F300-U+1FAFF`, `U+2600-U+27BF`), so the §0 allowlist gate passes vacuously today.
- No `VAULT_PASSWORD=`, `client_secret=`, `_SECRET=`, or value-bearing `api_key=` patterns appear in any `.mmd` source — only mechanism references (`X-API-Key`, `Path A (api_key)`, `startup-load`).
- No stale `:3000` references in `architecture.mmd` or `architecture-simple.mmd`.
- `langchain_agent`, `secrets.vault`, `Path A`/`B`/`C`, all four OAuth grant markers, and PingOne node labels are present where the test expects them.
- REGRESSION_PLAN.md row §1 is well-worded — names both what NOT to break (drift detection, §0 emoji, no-secret-values) AND the enforcer (the sync test path).
- REQUIREMENTS.md REQ-DIAGRAM-01..15 are sequentially numbered with no gaps and each is testable as written.

Two warnings worth fixing before this regression guard is treated as bulletproof, plus four info-level observations. None are launch-blocking; all are about hardening the new test so it actually catches what its docstring claims to catch.

## Warnings

### WR-01: `api_key=` FORBIDDEN_PATTERN silently allows secrets that begin with the letter X

**File:** `banking_api_ui/src/components/__tests__/ArchitectureDiagram.completeness.test.js:124`
**Issue:** The fourth FORBIDDEN_PATTERN entry uses

```js
{ re: /\bapi_key\s*=\s*[^X\s"][^\s"]*/i, name: 'api_key=value' },
```

The intent (per the inline comment on lines 122-123) is to allow header references like `X-API-Key:` while flagging value-bearing assignments like `api_key=foo`. But the regex achieves that by negating the literal character `X` in the first byte after `=`. With the `/i` flag, this means `api_key=X123`, `api_key=xyz`, `api_key=X-anything` all pass the test — even though they are obvious secret leaks. Verified empirically:

```
"api_key=foo123"  => flagged   (correct)
"api_key=X123"    => not flagged (BUG)
"X-API-Key: svc"  => not flagged (correct — but for the wrong reason)
```

The "wrong reason": `X-API-Key:` doesn't match because the regex requires `api_key` (lowercase letters), and `\b` + `_` boundary means `Key:` is not preceded by `api_key`. The `[^X]` clause never had to do work for that case. Worse, the test's stated rationale ("do NOT match `X-API-Key` header references") is already handled by the `=` requirement — `X-API-Key:` uses `:`, not `=`.

**Fix:** Drop the `X`-exclusion entirely. The `=` requirement already disambiguates assignments from header names. Tighten to require a non-quote, non-space character of any kind:

```js
{ re: /\bapi_key\s*=\s*[^\s"][^\s"]*/i, name: 'api_key=value' },
```

If you want to allow comment-style references like `api_key=value` inside `%%` mermaid comments (which are descriptive, not actual values rendered into the PNG), gate the check to strip `%%`-prefixed lines before scanning:

```js
const codeOnly = content
  .split('\n')
  .filter((line) => !line.trim().startsWith('%%'))
  .join('\n');
// then run FORBIDDEN_PATTERNS against codeOnly
```

This is a Warning (not Critical) because today's mmd files contain no value-bearing assignments at all — the gap is in the *future* guarantee. A bug introduced by a contributor pasting `api_key=Xprodkey...` into a label would slip past CI.

### WR-02: §0 emoji regex VS-16 handling is asymmetric — `⚠` and `⚠️` are both whitelisted, but ranges in `U+1F300-U+1FAFF` would skip the VS-16

**File:** `banking_api_ui/src/components/__tests__/ArchitectureDiagram.completeness.test.js:144-151`
**Issue:** The emoji regex is

```js
const EMOJI_RE = /([\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}])️?/gu;
```

The trailing `️?` is U+FE0F (variation selector 16) made optional. The ALLOWED_EMOJI set then explicitly lists both `⚠` and `⚠️` so either form is accepted. But:

1. `✅` (U+2705) and `❌` (U+274C) are in the `U+2600-U+27BF` range — fine. Both render without VS-16 in practice, so the asymmetry doesn't show up.
2. The `U+1F300-U+1FAFF` range covers most modern emoji. If someone introduces `🔐` (U+1F510) with or without VS-16, the regex captures it correctly. So the asymmetry between the two ranges is benign in practice.
3. The **real gap** is that the comment on line 150 says "Conservative emoji ranges — covers 🖥 ☁ which we know existed in architecture.mmd." But `🖥` (U+1F5A5) is in the range and is caught. `☁` (U+2601) is also in range. So the comment is accurate. ✓

The actual issue: the ranges miss **some** common emoji. U+1F600-U+1F64F (😀-🙏) and U+1F680-U+1F6FF (🚀-🛿) ARE inside U+1F300-U+1FAFF, so smileys and transport emojis are caught. U+2700-U+27BF (✂-➿) IS covered. But the range stops at U+27BF, missing things like U+2B50 (⭐, "white medium star") and U+2B55 (⭕, "heavy large circle"), which someone might paste into a node label thinking they're punctuation.

**Fix (defense-in-depth, optional):** Widen the second range to `[\u{2600}-\u{2B55}]` to cover the miscellaneous-symbols and dingbats blocks people actually use:

```js
const EMOJI_RE = /([\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{2B55}])️?/gu;
```

Or, simpler and more conservative: keep the existing regex but add a one-line test that asserts at least one *known-forbidden* glyph is detected as forbidden when synthetically injected — that locks in detection capability:

```js
test('emoji detector catches ⭐ when present', () => {
  const synthetic = '⭐ test';
  const matches = synthetic.match(EMOJI_RE) || [];
  expect(matches.length).toBeGreaterThan(0);
});
```

This is Warning-level because the four currently-shipped `.mmd` files are clean, but the test's purpose is forward-looking drift detection — the detector should be robust against the obvious sneakers.

## Info

### IN-01: SVC_LIST regex breaks if anyone adds a comment inside the array

**File:** `banking_api_ui/src/components/__tests__/ArchitectureDiagram.completeness.test.js:39`
**Issue:** The regex `^SVC_LIST=\(([^)]+)\)/m` captures everything between `(` and the first `)`. If a future maintainer formats `run-bank.sh` like:

```bash
SVC_LIST=(
  banking_api_server  # the BFF
  banking_mcp_server  # MCP
)
```

the regex still captures all content (because `[^)]+` is greedy across newlines under `/m`), but the inner `# the BFF` comment text would be split into the services list. `# the` and `BFF` would then fail the "service appears in .mmd" assertion.

**Fix:** After splitting on whitespace, strip out tokens that start with `#`:

```js
return match[1]
  .trim()
  .split(/\s+/)
  .filter(Boolean)
  .filter((tok) => !tok.startsWith('#'));
```

Or, more robustly, strip `# ...` runs from the match before splitting:

```js
const raw = match[1].replace(/#[^\n]*/g, ' ').trim();
return raw.split(/\s+/).filter(Boolean);
```

Today's `run-bank.sh` puts everything on one line with no comments, so this is informational.

### IN-02: `test('SVC_LIST parses to exactly 8 services')` is brittle to legitimate growth

**File:** `banking_api_ui/src/components/__tests__/ArchitectureDiagram.completeness.test.js:60-62`
**Issue:** Hard-coding `expect(services).toHaveLength(8)` means the next time someone correctly adds a 9th service to SVC_LIST AND a corresponding `.mmd` node, this test fails and forces a churn-only edit here. The downstream `test.each(services)` is already parameterized — the count assertion adds no information that the parametric loop doesn't already cover.

**Fix:** Either (a) delete the count assertion entirely (parametric loop is sufficient), or (b) replace with a lower bound that signals "at least the current 8" without locking the future:

```js
test('SVC_LIST has at least the current 8 services', () => {
  expect(services.length).toBeGreaterThanOrEqual(8);
});
```

Option (a) is preferred — the parametric loop is the authoritative check.

### IN-03: `MCP_SPEC` arrow.rfc reference in `InteractiveArchDiagram.js` may not resolve

**File:** `banking_api_ui/src/components/education/InteractiveArchDiagram.js:77, 228`
**Issue:** Pre-existing (not introduced this phase), but worth flagging since the file was touched. The component passes `rfc="MCP_SPEC"` to `<RfcLink>`. If `RfcLink`'s lookup table doesn't include the literal key `MCP_SPEC`, the link will render as broken text or as a "?" placeholder. Out of scope for this phase's edit (which was a top-of-file comment only), but if you're already in this file you might verify the key exists in `RfcLink`'s registry.

**Fix:** Not in scope for Phase 270. Note for follow-up: grep `RfcLink` for the `MCP_SPEC` key; if absent, add it or change the prop value. Minimal-diff discipline says skip unless touched.

### IN-04: REQ-DIAGRAM-14 acceptance text references `architecture-simple.png` but the file's actual comment points at `public/architecture/overview.png`

**File:** `.planning/REQUIREMENTS.md:153` and `banking_api_ui/src/components/education/InteractiveArchDiagram.js:11`
**Issue:** REQ-DIAGRAM-14 says the comment must note "the authoritative source is `architecture-simple.png`". The actual top-of-file comment names "Rendered PNG: `banking_api_ui/public/architecture/overview.png`" and the Mermaid source as `architecture-simple.mmd`. These are functionally the same (the PNG is rendered from the .mmd by `build-diagrams.sh`, output path `overview.png`), but the requirement text and the as-shipped comment use different filenames — `architecture-simple.png` (in REQUIREMENTS) vs `overview.png` (in the actual file).

The shipped comment is more accurate (`architecture-simple.png` doesn't exist; the renderer outputs `overview.png`). Either tighten the requirement to match reality:

```
REQ-DIAGRAM-14: ... noting the authoritative rendered source is
`banking_api_ui/public/architecture/overview.png` (built from
`architecture-simple.mmd`).
```

Or leave REQUIREMENTS.md alone and treat the mismatch as a one-time onboarding note. The latter is fine — REQUIREMENTS is a checklist captured at plan time; the shipped artifact is the source of truth.

---

_Reviewed: 2026-05-14_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: quick_
