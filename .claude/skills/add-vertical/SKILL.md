---
name: add-vertical
description: 'Step-by-step checklist for adding a new vertical/theme to the Super Banking demo. USE FOR: implementing a new industry skin (e.g. insurance, fintech, travel), adding chip labels, adding heuristic phrase vocabulary, writing a Helix LLM2 theme directive, and wiring agent persona text. Covers all required touchpoints: vertical JSON manifest, nlIntentParser THEME_VOCAB, HELIX_AGENT_DIRECTIVES.json themes map, HELIX_AGENT_DIRECTIVES_CONSOLE.md, and optional legacy industryPresets.js. DO NOT USE FOR: editing the banking baseline vertical, general OAuth/MCP changes, or UI refactoring outside the vertical config files.'
argument-hint: 'Name of the new vertical (e.g. insurance, travel, workforce)'
---

# Add a New Vertical / Theme

This skill walks through every file that must be created or updated when adding a new vertical. The
demo discovers verticals by scanning `demo_api_server/config/verticals/` — there are **no** hardcoded
vertical ID lists anywhere else. Follow the checklist in order; each step is independently testable.

---

## Checklist

### 1. Create the vertical JSON manifest

**File:** `demo_api_server/config/verticals/<id>.json`

Copy an existing manifest as a starting point (e.g. `healthcare.json`). Mandatory fields:

```jsonc
{
  "id": "<id>",                         // lowercase, no spaces (matches filename stem)
  "schemaVersion": 2,
  "identity": {
    "displayName": "<Brand Name>",
    "headerTitle": "<Brand Name>",
    "documentTitle": "<Brand Name> · PingOne AI IAM Core",
    "logoAlt": "<Brand Name> logo",
    "tagline": "<Short tagline>",
    "logoPath": "/branding/<id>-logo.svg"   // or null if no logo yet
  },
  "theme": {
    "cssVars": {
      "--app-primary-red":              "<hex>",
      "--app-primary-red-hover":        "<hex>",
      "--app-primary-red-mid":          "<hex>",
      "--app-primary-red-border":       "<hex>",
      "--brand-dashboard-header-start": "<hex>",
      "--brand-dashboard-header-end":   "<hex>",
      "--brand-app-shell-hero-start":   "<hex>",
      "--brand-app-shell-hero-end":     "<hex>",
      "--theme-accent":                 "<hex>",
      "--brand-dashboard-header-text":  "#ffffff"
    }
  },
  "terminology": {
    "account":            "<singular term>",
    "accounts":           "<plural term>",
    "accountTypes":       ["<type1>", "<type2>"],
    "transaction":        "<singular term>",
    "transactions":       "<plural term>",
    "transactionTypes":   ["<type1>", "<type2>"],
    "balance":            "<term for balance>",
    "agent":              "<Agent persona name>",
    "dashboard":          "<Dashboard label>",
    "highValueAction":    "<label for high-value action>",
    "highValueLabel":     "<HITL consent description>"
  },
  "agent": {
    "persona":            "<One-word persona name>",
    "greeting":           "Hi {name}! <opening message>",
    "systemPromptFlavor": "You are a <Brand> <persona>. <domain translation note>."
  },
  "dashboard": {
    "kind": "<id>",
    "chips": [
      { "key": "balance",      "label": "<themed chip label>" },
      { "key": "accounts",     "label": "<themed chip label>" },
      { "key": "transactions", "label": "<themed chip label>" },
      { "key": "transfer",     "label": "<themed chip label>" }
    ],
    "mockData": null
  },
  "scopes": {
    "read":         "read",
    "write":        "write",
    "transfer":     "transfer",
    "featureScope": "<feature>:read"    // scope for the primary action; plain scopes only — never "banking:*"
  },
  "demoUsers": {
    "customer": { "hint": "demoUser",  "passwordHint": "Tigers7&" },
    "admin":    { "hint": "demoAdmin", "passwordHint": "Tigers7&" }
  }
}
```

> **Scope rule:** use plain scope names (`read`, `write`, `admin`, `transfer`) — never `banking:*`-prefixed names.

Verify the file is valid JSON:
```bash
node -e "require('./demo_api_server/config/verticals/<id>.json'); console.log('OK')"
```

---

### 2. Add heuristic vocabulary to `nlIntentParser.js`

**File:** `demo_api_server/services/nlIntentParser.js`  
**Location:** `THEME_VOCAB` object (search for `const THEME_VOCAB`)

Add a new key matching your vertical `id`. Each entry is `{ re: <RegExp>, action: '<banking_action>' }`.

```javascript
  <id>: [
    // IMPORTANT: put the most specific patterns FIRST.
    // If two regexes could match the same phrase, the first one wins.
    // Example: "release records → transfer" MUST precede "records → accounts".
    { re: /\b(release|share|send)\s*(my\s*)?<thing>s?\b/, action: 'transfer' },
    { re: /\b(my\s*)?<thing>s?\b|\bshow\s*(my\s*)?<thing>s?\b/, action: 'accounts' },
    { re: /\b(check\s*|my\s*)?<balance_term>\b/, action: 'balance' },
    { re: /\b(my\s*|show\s*)?<transaction_term>s?\b/, action: 'transactions' },
    // Optional additional actions:
    { re: /\b<spending_phrase>\b/, action: 'spending_summary' },
    { re: /\b<biggest_phrase>\b/, action: 'biggest_purchase' },
  ],
```

**Ordering rule:** more specific regexes first. If a phrase could match multiple entries, the first
match wins — order is load-bearing.

**Transfer amount extraction** is automatic — `parseTheme` extracts a `$NNN` amount from the message
when `action === 'transfer'`. No extra code needed.

After editing, run the heuristic tests to confirm no regressions:
```bash
npm run test:api-server
```

---

### 3. Add the Helix LLM2 theme directive to `HELIX_AGENT_DIRECTIVES.json`

**File:** `docs/HELIX_AGENT_DIRECTIVES.json`  
**Location:** inside the `"themes"` object

Add a new key matching your vertical `id`. The value is a plain string (use `\n` for newlines).

Follow this template — keep all sections, fill in `<…>` placeholders:

```json
"<id>": "THEME OVERRIDE — <BRAND NAME> (<INDUSTRY>):\nThe user is an authenticated <role description>.\nTranslate all <industry> language to the underlying banking actions — never surface banking terminology.\nRestrict allowed actions to the following — do not emit <list what is NOT allowed, e.g. mortgage or deposit/withdraw> shapes:\n{\"kind\":\"banking\",\"banking\":{\"action\":\"accounts\",\"params\":{}}}\n{\"kind\":\"banking\",\"banking\":{\"action\":\"balance\",\"params\":{}}}\n{\"kind\":\"banking\",\"banking\":{\"action\":\"transactions\",\"params\":{}}}\n{\"kind\":\"banking\",\"banking\":{\"action\":\"transfer\",\"params\":{\"fromId\":\"checking\",\"toId\":\"savings\",\"amount\":0}}}\n{\"kind\":\"banking\",\"banking\":{\"action\":\"spending_summary\",\"params\":{}}}\n{\"kind\":\"none\",\"message\":\"short hint\"}\n\nTERMINOLOGY MAP (translate to banking actions):\n\"<themed term>\" / \"<alt phrase>\" → accounts\n\"<themed term>\" / \"<alt phrase>\" → transactions\n\"<themed term>\" / \"<alt phrase>\" → balance\n\"<themed term>\" / \"<alt phrase>\" → transfer\n\nCHIP VOCABULARY for <id>:\n\"<chip label>\" / \"<alt phrase>\" → balance\n\"<chip label>\" / \"<alt phrase>\" → accounts\n\"<chip label>\" / \"<alt phrase>\" → transactions\n\"<chip label>\" / \"<alt phrase>\" → transfer\n\nRefuse only for <narrow refusal condition>:\n{\"kind\":\"none\",\"message\":\"<refusal message>\"}\nNever refuse on demo-disclaimer or access grounds."
```

Verify the JSON is still valid after editing:
```bash
node -e "require('./docs/HELIX_AGENT_DIRECTIVES.json'); console.log('OK')"
```

> The `buildSystem()` function in `geminiNlIntent.js` reads `active_vertical` at call time and appends
> the matching theme string. If the key is missing, it falls back to an empty string (banking baseline).
> If the value is `null` (like `"banking": null`), the fallback also applies.

---

### 4. Update `HELIX_AGENT_DIRECTIVES_CONSOLE.md`

**File:** `docs/HELIX_AGENT_DIRECTIVES_CONSOLE.md`

This is the human-readable version of the directives for pasting into the Helix console. Append a
new theme section at the end of the file following the existing pattern:

```markdown
---

### Theme: <Brand Name>

<paste the plain-text version of the theme directive, no JSON escapes, no backslashes>
```

> The Helix console has **no import feature** — directives are pasted as plain text into the
> AI Task node system prompt field. The console .md file is the human copy-paste source.

---

### 5. Verify end-to-end routing

Switch to the new vertical via the config UI or API:
```bash
curl -sk -X PUT https://api.ping.demo:3001/api/config/vertical \
  -H 'Content-Type: application/json' \
  -d '{"verticalId":"<id>"}' | jq
```

Then test the chip phrases in the agent chat, or run the Helix theme test script:
```bash
node /tmp/test-helix-themes.js   # add your vertical's cases to TESTS array first
```

Confirm:
- Chips render with the themed labels (not banking labels)
- Agent greeting uses the new persona text
- Heuristic routes the chip phrases to the correct banking actions without calling Helix/Ollama
- Helix (when configured) routes themed NL phrases correctly

---

### Optional: legacy `industryPresets.js`

**File:** `demo_api_server/services/industryPresets.js` (if it exists)

This file is a legacy UI preset map used by older UI components. Check if it exists and whether
your vertical needs an entry. If it does not exist or is not referenced, skip this step — the
manifest-driven system (`verticalConfigService.js`) supersedes it.

---

## No other files need changing

The following are **automatic** — no edits required:

| What | Why automatic |
|---|---|
| `/api/config/vertical` route | Scans `config/verticals/` directory at startup |
| `verticalConfigService.js` | Loads all `.json` files in the verticals directory |
| `BankingChips.jsx` | Reads chip labels from the manifest via `applyChipLabels()` |
| Agent persona / greeting | Read from manifest `agent` block at runtime |
| Dashboard terminology | Read from manifest `terminology` block at runtime |

Do **not** add a new vertical ID to any hardcoded array or switch statement — there are none.

---

## Checklist summary

- [ ] `demo_api_server/config/verticals/<id>.json` — manifest with chips, terminology, agent, scopes
- [ ] `demo_api_server/services/nlIntentParser.js` — add entry to `THEME_VOCAB`, most-specific regex first
- [ ] `docs/HELIX_AGENT_DIRECTIVES.json` — add entry to `"themes"` object
- [ ] `docs/HELIX_AGENT_DIRECTIVES_CONSOLE.md` — append plain-text theme section
- [ ] Verify JSON validity for both docs files
- [ ] Run `npm run test:api-server` — no regressions
- [ ] Switch to vertical, confirm chips + routing + greeting
- [ ] (Optional) `industryPresets.js` if legacy presets exist
