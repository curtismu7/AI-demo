---
name: add-vertical
description: 'Reference checklist for adding a new vertical/theme to the Super Banking demo (the /new-vertical command automates it). USE FOR: implementing a new industry skin (e.g. insurance, fintech, travel), adding dashboard chips, hero stat cards, llmChipGroups, heuristic phrase vocabulary, a Helix theme directive, agent persona text, and an optional feature page. Covers all touchpoints: the schemaVersion-3 manifest.json + mock-data.json under config/verticals/<id>/, nlIntentParser THEME_VOCAB, HELIX_AGENT_DIRECTIVES.json themes map, HELIX_AGENT_DIRECTIVES_CONSOLE.md, and the cross-service feature-page wiring (gateway + MCP registry + backend). DO NOT USE FOR: editing the banking baseline vertical, general OAuth/MCP changes, or UI refactoring outside the vertical config files.'
argument-hint: 'Name of the new vertical (e.g. insurance, travel, workforce)'
---

# Add a New Vertical / Theme

This skill is the reference checklist of every file that must be created or updated when adding a new
vertical. The demo discovers verticals by scanning `demo_api_server/config/verticals/` — there are
**no** hardcoded vertical ID lists anywhere else. Follow the checklist in order; each step is
independently testable.

> **For an automated, end-to-end walk-through, run the `/new-vertical` command** — it asks the brand
> questions one at a time and generates every touchpoint below, then verifies them. This skill
> documents what that command produces and is the source of truth if the two ever disagree.

---

## Checklist

### 1. Create the vertical JSON manifest

**File:** `demo_api_server/config/verticals/<id>/manifest.json` (each vertical is a **directory**
containing `manifest.json` plus an optional `mock-data.json`).

Copy an existing manifest as a starting point (e.g. `sporting-goods/manifest.json`). The manifest is
**Zod-validated** against `demo_api_server/services/verticalManifest/schema.js`. Required fields:
`id`, `schemaVersion: 3`, `identity.displayName`, `theme.cssVars` (≥1), `agent.persona`. Everything
else below is recommended but optional.

```jsonc
{
  "id": "<id>",                         // ^[a-z][a-z0-9-]*$ — matches the directory name
  "schemaVersion": 3,
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
      { "key": "transfer",     "label": "<themed chip label>" },
      { "key": "feature",      "label": "<feature page name>" }   // every shipped vertical has this 5th chip
    ],
    "hero": {                                                      // 4 at-a-glance cards; dataKeys resolve from mock-data.json
      "cards": [
        { "label": "<stat 1>", "dataKey": "heroStats.<key1>", "format": "money" },
        { "label": "<stat 2>", "dataKey": "heroStats.<key2>", "format": "count" },
        { "label": "<stat 3>", "dataKey": "heroStats.<key3>", "format": "text" },
        { "label": "<stat 4>", "dataKey": "heroStats.<key4>", "format": "date" }
      ]
    },
    "llmChipGroups": {                                             // suggestion chips shown in LLM mode
      "<Group>": [ { "id": "<id>_g1", "label": "<short>", "message": "<NL prompt>" } ]
    }
  },
  "scopes": {
    "read":         "read",
    "write":        "write",
    "transfer":     "transfer",
    "featureScope": "<feature>:read"    // scope for the feature page; plain scopes only — never "banking:*"
  },
  "featurePage": {                       // OPTIONAL — manifest block for the 5th chip's detail view
    "mcpTool":     "show_<noun>",        // served over the API-key path; needs backend wiring (see Step 6)
    "pageTitle":   "<Feature Page Title>",
    "badgeLabel":  "API-KEY PATH",
    "accentColor": "<primary hex>",
    "dataKey":     "<dataKey>",          // root key of the backend response — NOT from mock-data.json
    "fields": [
      { "label": "<Field>",  "path": "<path>" },
      { "label": "<Amount>", "path": "<path>", "format": "money", "accent": true }
    ],
    "sectionTitle": "<heading>",
    "emptyPrompt":  "<chip-5 prompt>",
    "scopeError":   "The agent's access token does not carry the <feature>:read scope. Sign out and back in to consent, then try \"<chip 5 label>\" again."
  },
  "demoUsers": {
    "customer": { "hint": "demoUser",  "passwordHint": "Tigers7&" },
    "admin":    { "hint": "demoAdmin", "passwordHint": "Tigers7&" }
  }
}
```

> **`format` values** (the `FormatEnum`): `money`, `count`, `date`, `text`, `percent`. There is no
> `mockData` field on the manifest — dashboard mock data lives in a sibling `mock-data.json`.

### 1b. Write `mock-data.json`

`demo_api_server/config/verticals/<id>/mock-data.json` — free-form object. The hero cards resolve
their `heroStats.*` dataKeys from here, so include at least a `heroStats` block:

```json
{ "heroStats": { "<key1>": 0, "<key2>": 0, "<key3>": "<text>", "<key4>": "2026-01-01" } }
```

> **Scope rule:** use plain scope names (`read`, `write`, `admin`, `transfer`) — never `banking:*`-prefixed names.

Verify the manifest validates against the Zod schema and is discoverable:
```bash
node -e "const {verticalManifest}=require('./demo_api_server/services/verticalManifest'); verticalManifest.init(); const ids=verticalManifest.list().map(v=>v.id); console.log('Loaded:', ids.join(', ')); console.log(ids.includes('<id>') ? '✅' : '❌ missing');"
```
If it prints `Invalid manifest at …`, the message includes the failing Zod field — fix and re-run.

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

Switch to the new vertical via the vertical switcher in the UI, or the admin API
(`POST /api/verticals/active`, admin-gated, body `{ "id": "<id>" }`):
```bash
curl -sk -X POST https://api.ping.demo:3001/api/verticals/active \
  -H 'Content-Type: application/json' \
  --cookie "connect.sid=<admin session cookie>" \
  -d '{"id":"<id>"}'
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

### Optional: wire the feature-page backend

Only needed if the manifest declares a `featurePage` and you want the 5th chip to return real data.
The feature page is served over the **API-key path** through the MCP gateway — NOT by `mock-data.json`
and NOT by the MCP server tool handlers (the `show_*` handlers are registered for visibility only; the
gateway intercepts the call). The chip degrades gracefully (empty state / `scopeError`) until this is
wired, so it is safe to ship the manifest first and do this later. To make `show_<noun>` return data:

1. **Backend endpoint** — add `GET /<noun>` to a backend service (model on `demo_mortgage_service/server.js`, which already serves `mortgage`, `healthRecord`, `gearOrder`, etc.); X-API-Key protected; returns `{ "<dataKey>": { …manifest field paths… }, "source": "...", "authMechanism": "X-API-Key (shared secret)" }`.
2. **Gateway disposition** — add `show_<noun>` to the `APIKEY_TOOLS` set in `demo_mcp_gateway/src/router.ts`.
3. **Gateway backend route** — add `show_<noun>` → URL in the `APIKEY_BACKEND_ROUTES` map in the same `router.ts`.
4. **Gateway display name** — add `show_<noun>` to `TOOL_DISPLAY_NAMES` in `demo_mcp_gateway/src/apiKeyDispatch.ts`.
5. **MCP registry visibility** — add a `show_<noun>` entry to the `TOOLS` map in `demo_mcp_server/src/tools/BankingToolRegistry.ts` (copy the shape of an existing `show_mortgage` / `show_gear_order` entry) with its `featureScope`; no handler needed.

Then `npm run build` in both `demo_mcp_gateway` and `demo_mcp_server`, restart, and provision the
`featureScope` in PingOne (next `npm run pingone:bootstrap`). This is a cross-service change — read the
`mcp-gateway` and `mcp-server` skills and check `REGRESSION_PLAN.md` for those files first.

---

## No other files need changing

The following are **automatic** — no edits required:

| What | Why automatic |
|---|---|
| `verticalManifest` loader (`services/verticalManifest/`) | Scans each `config/verticals/<id>/` directory at server `init()`, validates `manifest.json` with Zod, caches in memory |
| `/api/verticals/*` routes | Read from the loader; `list`, `active`, `clone`, overlay edits |
| `BankingChips.jsx` | Reads chip labels from the manifest at runtime |
| Agent persona / greeting | Read from manifest `agent` block at runtime |
| Dashboard terminology | Read from manifest `terminology` block at runtime |

A brand-new on-disk manifest is picked up at the next server start (`init()` re-scans the directory).
A running server can also `loader.reload('<id>')` via the verticals admin route without a full restart.

Do **not** add a new vertical ID to any hardcoded array or switch statement — there are none.

---

## Checklist summary

- [ ] `demo_api_server/config/verticals/<id>/manifest.json` — schemaVersion 3: 5 chips, hero cards, llmChipGroups, terminology, agent, scopes (+ optional featurePage)
- [ ] `demo_api_server/config/verticals/<id>/mock-data.json` — at least a `heroStats` block feeding the hero card dataKeys
- [ ] `demo_api_server/services/nlIntentParser.js` — add entry to `THEME_VOCAB`, most-specific regex first
- [ ] `docs/HELIX_AGENT_DIRECTIVES.json` — add entry to `"themes"` object
- [ ] `docs/HELIX_AGENT_DIRECTIVES_CONSOLE.md` — append plain-text theme section
- [ ] Verify both docs files parse (`node -e "require('./docs/HELIX_AGENT_DIRECTIVES.json')"`)
- [ ] Verify the manifest loads + is discoverable (the `verticalManifest.init()` one-liner above)
- [ ] Run `npm run test:api-server` — no regressions
- [ ] Switch to vertical, confirm chips + hero stats + routing + greeting
- [ ] (Optional) Wire the feature-page backend if `featurePage` was declared
