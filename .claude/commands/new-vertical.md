---
description: Guided wizard to create a complete new demo vertical (theme) end-to-end — manifest (chips, hero, llmChipGroups, featurePage), mock-data, heuristic routing, and Helix directives
allowed-tools: Read, Write, Edit, Bash(git *), Bash(node *), Bash(npm *), WebFetch
argument-hint: [vertical-name]
---

# New Vertical Wizard (end-to-end)

Arguments: $ARGUMENTS

You are creating a new vertical (theme) for this multi-vertical demo platform. A complete vertical
that matches the current pattern (all 5 shipped verticals follow it) produces the following and then
verifies the result:

1. **Manifest** — `demo_api_server/config/verticals/<id>/manifest.json` (branding, terminology, agent persona, 5 dashboard chips, hero stat cards, `llmChipGroups`, scopes, and an optional `featurePage`). This + its `mock-data.json` are the only files the platform requires to load, switch, and theme a vertical.
2. **Mock data** — `demo_api_server/config/verticals/<id>/mock-data.json` supplying the dashboard `heroStats.*` values the manifest's hero cards reference.
3. **Heuristic routing vocabulary** — an entry in `THEME_VOCAB` in `demo_api_server/services/nlIntentParser.js` so themed phrases route without an LLM.
4. **Helix LLM directive (JSON)** — an entry in the `themes` object of `docs/HELIX_AGENT_DIRECTIVES.json` so the LLM path understands themed language.
5. **Helix console doc** — a plain-text section appended to `docs/HELIX_AGENT_DIRECTIVES_CONSOLE.md` (the human copy-paste source for the Helix console, which has no import feature).

A working **feature page** (the 5th chip's detail view) is a separate cross-service change — backend service endpoint + MCP-gateway routing + registry entry. This wizard writes the `featurePage` *manifest* block and hands you the exact wiring checklist (Step 9); it does not auto-edit the gateway or backend services. The chip degrades gracefully until that backend exists.

> The `add-vertical` skill (`.claude/skills/add-vertical/`) is the authoritative reference checklist for these touchpoints. This command automates that checklist. If the two ever disagree, the skill and the live schema win — re-read them.

**Before asking anything, read these so you produce the exact current schema (schemaVersion 3, Zod-validated):**

- `demo_api_server/config/verticals/sporting-goods/manifest.json` and its sibling `mock-data.json` — a complete example vertical (5 chips, hero, llmChipGroups, featurePage)
- `demo_api_server/services/verticalManifest/schema.js` — the authoritative Zod schema (required vs optional fields, the `FormatEnum`)
- The `THEME_VOCAB` entries in `demo_api_server/services/nlIntentParser.js` (around line 333)
- The `themes` object in `docs/HELIX_AGENT_DIRECTIVES.json`

Do not start asking questions until you have read all of these.

---

## Step 1 — Gather requirements (ask questions one at a time)

Work through these in order. Do not batch them. Wait for the answer to each before asking the next.

**Q1 — Vertical name and brand**
Ask: "What is the brand name for this vertical?" (e.g. "CareConnect", "Great Buy", "LoanBridge")

**Q2 — Industry tagline**
Ask: "One-line tagline? (e.g. 'AI-Powered Healthcare Demo')"

**Q3 — Brand colors — website or manual**
Ask: "Do you have a website or brand URL I can pull colors from, or would you like to provide hex codes directly?
- Option A: give me a URL — I'll fetch the page and extract the dominant brand colors
- Option B: give me primary and accent hex codes directly
- Option C: I'll generate a professional palette based on the industry"

If Option A: use WebFetch to retrieve the URL. Extract background colors, button colors, header/nav colors, and link colors from inline styles, CSS variables, and class patterns. Pick the strongest 2–3 brand colors. Show the user what you found and ask them to confirm before using them.

If Option C: choose a palette appropriate for the industry (healthcare → teal/green, finance → navy/blue, legal → charcoal/gold, etc.) and show the user what you picked with the hex codes before proceeding.

**Q4 — Logo**
Ask: "Where should the logo come from?
- Option A: I have a file at a path or URL — paste the path or URL
- Option B: Use a text/CSS placeholder for now (no image file needed to get started)

Note: logoPath is just a string in the manifest — the image itself must be placed in `demo_api_ui/public/branding/<filename>` separately. Choosing option B omits logoPath and the UI will show the brand name as text."

**Q5 — Core terminology**
Ask: "What are the core nouns for this vertical? I need:
- What is an 'account' called? (e.g. 'Patient Record', 'Policy', 'Property Listing')
- What is a 'transaction' called? (e.g. 'Appointment', 'Claim', 'Booking')
- What is a 'transfer' / high-value action called? (e.g. 'Records Release', 'Claim Submission', 'Wire Transfer')
- What are 2–3 sub-types of 'account'? (e.g. 'Primary Care, Specialist, Mental Health')
- What are 3–4 sub-types of 'transaction'? (e.g. 'Check-in, Consultation, Referral')
- What is the 'balance' concept called? (e.g. 'Coverage', 'Reward Points', 'Available Credit')"

**Q6 — Agent persona**
Ask: "What should the AI agent be called, and what is its one-paragraph greeting message? The greeting can include `{name}` as a placeholder for the user's first name. If you're not sure, I'll write one based on the terminology you've given me."

If the user says "write one for me": compose a greeting that mentions the 3 main things the agent can do (check balances/records, initiate the high-value action, and explain the OAuth flows behind the scenes). Keep it under 40 words.

**Q7 — Dashboard chips**
Every current vertical has **5** dashboard chips with keys `balance`, `accounts`, `transactions`, `transfer`, and `feature`. The first four are the core actions; `feature` opens the vertical's feature page (Q11). Ask: "What should the 5 chip labels say? Based on your answers so far I'd suggest: [propose labels from their terminology — the 5th from the feature page name]. Is that right, or do you want different wording?"

**Q8 — Hero stat cards**
The dashboard hero shows 4 stat cards. Ask: "What 4 at-a-glance stats should the dashboard hero show? For each I need a label and a value type (money / count / date / text / percent). I'd suggest based on your vertical: [propose 4 from terminology, e.g. 'Total Coverage (money), Open Claims (count), Plan Tier (text), Last Visit (date)']. Confirm or change?" These become `dashboard.hero.cards` plus a `heroStats` block in `mock-data.json`.

**Q9 — Feature scope**
Ask: "What is the one vertical-specific OAuth scope that gates the high-value action and the feature page? This is provisioned on the PingOne resource server at bootstrap time. Convention is `<noun>:read` (e.g. `records:read`, `claims:read`, `listings:read`). Suggestion based on your high-value action: [suggest from Q5 transfer term]. Confirm or change? Use plain scope names — never `banking:*`-prefixed."

**Q10 — Demo user hints (optional)**
Ask: "Do you want custom demo username/password hints, or keep the platform defaults (demoUser / demoAdmin / Tigers7&)?"

**Q11 — Feature page (optional, cross-service)**
Explain first: "Every existing vertical has a *feature page* — a detail view (e.g. mortgage, health record, gear order) served over the API-key path through a separate backend service. Wiring a *working* feature page is a cross-service change beyond this manifest: it needs a backend REST endpoint, three MCP-gateway routing edits, and an MCP registry entry (see Step 9). I can either:
- Option A: write the `featurePage` manifest block + a placeholder `feature` chip now so the manifest matches the standard shape, and give you the exact checklist to wire the backend later (the chip degrades gracefully — it shows an empty state until the backend exists), or
- Option B: skip the feature page entirely (omit `featurePage` and drop the 5th chip) for a 4-chip vertical that is fully working today.
Which do you want?"

If Option A: ask for the feature page name, the `mcpTool` name (convention `show_<noun>`, e.g. `show_claim`), the `dataKey` (the response root key, e.g. `claim`), and 4–8 display fields (label + path + optional format). 

No further questions after Q11 — Steps 4–6 derive the heuristic vocab, Helix directive, and console doc from the earlier answers.

---

## Step 2 — Show a preview

Before writing any file, print the full manifest JSON, the `mock-data.json` you'll write, **and** the THEME_VOCAB entry you intend to add, and ask: "Does this look right? I'll generate everything once you confirm."

---

## Step 3 — Write the manifest

Pick a `<vertical-id>`: the brand name lowercased with spaces replaced by hyphens, matching `^[a-z][a-z0-9-]*$`. Use the shorter / more meaningful of the brand name or industry (e.g. "CareConnect" healthcare demo → `healthcare`; a brand-first id → `careconnect`).

Create the directory and write the manifest to:
`demo_api_server/config/verticals/<vertical-id>/manifest.json`

The manifest is **Zod-validated** against `demo_api_server/services/verticalManifest/schema.js`. Required fields (validation fails without them): `id`, `schemaVersion: 3`, `identity.displayName`, `theme.cssVars` (≥1 var), `agent.persona`. Everything below beyond those is recommended for a good demo but optional per the schema.

```json
{
  "id": "<vertical-id>",
  "schemaVersion": 3,
  "identity": {
    "displayName": "<Brand Name>",
    "headerTitle": "<Brand Name>",
    "documentTitle": "<Brand Name> · PingOne AI IAM Core",
    "logoAlt": "<Brand Name> logo",
    "tagline": "<tagline>"
  },
  "theme": {
    "cssVars": {
      "--app-primary-red": "<primary>",
      "--app-primary-red-hover": "<primary darkened ~10%>",
      "--app-primary-red-mid": "<primary lightened ~20%>",
      "--app-primary-red-border": "<primary darkened ~20%>",
      "--brand-dashboard-header-start": "<header gradient start>",
      "--brand-dashboard-header-end": "<header gradient end>",
      "--brand-app-shell-hero-start": "<hero gradient start>",
      "--brand-app-shell-hero-end": "<hero gradient end>",
      "--theme-accent": "<accent color>",
      "--brand-dashboard-header-text": "#ffffff"
    }
  },
  "terminology": {
    "account": "<singular>",
    "accounts": "<plural>",
    "accountTypes": ["<type1>", "<type2>"],
    "transaction": "<singular>",
    "transactions": "<plural>",
    "transactionTypes": ["<type1>", "<type2>", "<type3>"],
    "balance": "<balance term>",
    "agent": "<Agent Name>",
    "dashboard": "<Dashboard label>",
    "highValueAction": "<high-value action label>",
    "highValueLabel": "<HITL consent description>"
  },
  "agent": {
    "persona": "<Agent Name>",
    "greeting": "<greeting with optional {name}>",
    "systemPromptFlavor": "You are a <Brand> <agent name>. The underlying tools are banking demo tools; keep responses <industry>-flavored — accounts are <account term>, transactions are <transaction term>, transfers are <transfer term>, balance is <balance term>. Be concise and professional."
  },
  "dashboard": {
    "kind": "<vertical-id>",
    "chips": [
      { "key": "balance", "label": "<chip 1>" },
      { "key": "accounts", "label": "<chip 2>" },
      { "key": "transactions", "label": "<chip 3>" },
      { "key": "transfer", "label": "<chip 4>" },
      { "key": "feature", "label": "<chip 5 — feature page name>" }
    ],
    "hero": {
      "cards": [
        { "label": "<stat 1 label>", "dataKey": "heroStats.<key1>", "format": "money" },
        { "label": "<stat 2 label>", "dataKey": "heroStats.<key2>", "format": "count" },
        { "label": "<stat 3 label>", "dataKey": "heroStats.<key3>", "format": "text" },
        { "label": "<stat 4 label>", "dataKey": "heroStats.<key4>", "format": "date" }
      ]
    },
    "llmChipGroups": {
      "<Group A>": [
        { "id": "<id>_a1", "label": "<short label>", "message": "<natural-language prompt>" },
        { "id": "<id>_a2", "label": "<short label>", "message": "<natural-language prompt>" }
      ],
      "<Group B>": [
        { "id": "<id>_b1", "label": "<short label>", "message": "<natural-language prompt>" },
        { "id": "<id>_b2", "label": "<short label>", "message": "<natural-language prompt>" }
      ]
    }
  },
  "scopes": {
    "read": "read",
    "write": "write",
    "transfer": "transfer",
    "featureScope": "<feature-scope>"
  },
  "featurePage": {
    "mcpTool": "show_<noun>",
    "pageTitle": "<Feature Page Title>",
    "badgeLabel": "API-KEY PATH",
    "accentColor": "<primary hex>",
    "dataKey": "<dataKey>",
    "fields": [
      { "label": "<Field 1>", "path": "<jsonPath1>" },
      { "label": "<Amount>", "path": "<amountPath>", "format": "money", "accent": true },
      { "label": "<Status>", "path": "<statusPath>" }
    ],
    "sectionTitle": "<section heading>",
    "emptyPrompt": "<chip-5 prompt text>",
    "scopeError": "The agent's access token does not carry the <feature-scope> scope. Sign out and sign back in to consent to <feature> access, then try \"<chip 5 label>\" again."
  },
  "demoUsers": {
    "customer": { "hint": "<username hint>", "passwordHint": "<password hint>" },
    "admin": { "hint": "<admin hint>", "passwordHint": "<password hint>" }
  }
}
```

**CSS variable note:** The variable names (`--app-primary-red` etc.) are legacy names that control real UI elements regardless of color. Do not rename them. Just set the correct color values.

**Hero `format` values:** `money`, `count`, `date`, `text`, `percent` (the `FormatEnum` in `schema.js`). Match each card's format to the value type the user gave in Q8.

**If the user chose Option B in Q11** (no feature page): drop the `featurePage` block and the 5th `feature` chip — a 4-chip vertical is valid and fully working.

### Step 3b — Write `mock-data.json`

Write a sibling file `demo_api_server/config/verticals/<vertical-id>/mock-data.json`. It is a free-form object (`MockDataSchema = z.record(z.string(), z.unknown())`); if omitted the loader defaults to `{}`, but the hero cards resolve their `heroStats.*` `dataKey`s from **this file**, so it is needed for the hero to show real numbers. Minimum:

```json
{
  "heroStats": {
    "<key1>": 0,
    "<key2>": 0,
    "<key3>": "<text>",
    "<key4>": "2026-01-01"
  }
}
```

> **The feature page's `dataKey` does NOT come from `mock-data.json`** — it is served at runtime by a backend service over the API-key path (see Step 9). `mock-data.json` only feeds `heroStats.*` and any other dashboard data you reference.

---

## Step 4 — Add the heuristic routing vocabulary

**File:** `demo_api_server/services/nlIntentParser.js` — the `THEME_VOCAB` object (around line 333).

Insert a new key matching `<vertical-id>`. Each entry is `{ re: <RegExp>, action: '<banking_action>' }`. Derive the regexes from the Q5 terminology and Q7 chip labels.

```javascript
  '<vertical-id>': [
    // ORDER IS LOAD-BEARING: first match wins. Most-specific patterns FIRST.
    // The high-value / transfer phrase must precede the broad "accounts" noun,
    // or e.g. "release records" would match the records→accounts rule first.
    { re: /\b(<transfer verbs>)\s*(my\s*)?<thing>s?\b/, action: 'transfer' },
    { re: /\b(my\s*)?<account noun>s?\b|\bshow\s*(my\s*)?<account noun>s?\b/, action: 'accounts' },
    { re: /\b(check\s*|my\s*|view\s*)?<balance term>\b/, action: 'balance' },
    { re: /\b(my\s*|show\s*|view\s*)?<transaction noun>s?\b/, action: 'transactions' },
    // Optional extras if relevant to the vertical:
    // { re: /\b<spending phrase>\b/, action: 'spending_summary' },
    // { re: /\b<biggest phrase>\b/, action: 'biggest_purchase' },
  ],
```

Valid `action` values: `accounts`, `balance`, `transactions`, `transfer`, `spending_summary`, `biggest_purchase`. Transfer amount extraction is automatic — `parseTheme` pulls a `$NNN` figure from the message when `action === 'transfer'`; no extra code needed.

---

## Step 5 — Add the Helix LLM directive (JSON)

**File:** `docs/HELIX_AGENT_DIRECTIVES.json` — insert a new key matching `<vertical-id>` inside the `themes` object. The value is a single plain string (use `\n` for newlines). `geminiNlIntent.js` `buildSystem()` appends `themes[vertical]` to the base prompt at call time; a missing key falls back to the banking baseline.

```
"<vertical-id>": "THEME OVERRIDE — <BRAND NAME> (<INDUSTRY>):\nThe user is an authenticated <role>.\nTranslate all <industry> language to the underlying banking actions — never surface banking terminology.\nAllowed action shapes:\n{\"kind\":\"banking\",\"banking\":{\"action\":\"accounts\",\"params\":{}}}\n{\"kind\":\"banking\",\"banking\":{\"action\":\"balance\",\"params\":{}}}\n{\"kind\":\"banking\",\"banking\":{\"action\":\"transactions\",\"params\":{}}}\n{\"kind\":\"banking\",\"banking\":{\"action\":\"transfer\",\"params\":{\"fromId\":\"checking\",\"toId\":\"savings\",\"amount\":0}}}\n{\"kind\":\"none\",\"message\":\"short hint\"}\n\nTERMINOLOGY MAP:\n\"<themed term>\" → accounts\n\"<themed term>\" → transactions\n\"<themed term>\" → balance\n\"<themed term>\" → transfer\n\nCHIP VOCABULARY:\n\"<chip 1>\" → balance\n\"<chip 2>\" → accounts\n\"<chip 3>\" → transactions\n\"<chip 4>\" → transfer\n\nRefuse only for <narrow condition>:\n{\"kind\":\"none\",\"message\":\"<refusal message>\"}\nNever refuse on demo-disclaimer or access grounds."
```

---

## Step 6 — Append the Helix console doc

**File:** `docs/HELIX_AGENT_DIRECTIVES_CONSOLE.md` — append a new section at the end. This is the human copy-paste source for the Helix console (no JSON escapes, no backslashes — real newlines).

```markdown
---

### Theme: <Brand Name>

<plain-text version of the Step-5 directive — real newlines, no \n escapes>
```

---

## Step 7 — Verify in place (generate + verify gate)

Run all checks. **Do not commit on any failure** — read the error, fix the offending file, re-run.

```bash
# 1. Both Helix docs are still valid JSON / parseable
node -e "require('./docs/HELIX_AGENT_DIRECTIVES.json'); console.log('Helix JSON OK')"

# 2. nlIntentParser still loads (no syntax error from the THEME_VOCAB edit)
node -e "require('./demo_api_server/services/nlIntentParser.js'); console.log('nlIntentParser OK')"

# 3. The manifest + mock-data validate against the Zod schema and the vertical is discoverable,
#    and every hero dataKey (heroStats.*) actually resolves in mock-data.json
node -e "const {verticalManifest:V}=require('./demo_api_server/services/verticalManifest'); const ID='<vertical-id>'; V.init(); if(!V.list().some(v=>v.id===ID)){console.log('❌ '+ID+' MISSING'); process.exit(1);} const {manifest,mockData}=V.loader.get(ID); const get=(o,p)=>p.split('.').reduce((a,k)=>a&&a[k],o); const cards=manifest.dashboard&&manifest.dashboard.hero?manifest.dashboard.hero.cards:[]; const missing=cards.filter(c=>get(mockData,c.dataKey)===undefined).map(c=>c.dataKey); console.log(missing.length?'⚠️ hero dataKeys missing in mock-data: '+missing.join(', '):'✅ '+ID+' discovered + hero stats resolve');"

# 4. No regressions in BFF / heuristic routing tests
npm run test:api-server
```

If step 3 prints `Invalid manifest at …` it will include the Zod issue list — fix the named field and re-run. If it warns that hero dataKeys are missing, add them to `mock-data.json`. If `npm run test:api-server` fails, inspect whether your THEME_VOCAB regex broke an existing routing test before proceeding.

---

## Step 8 — Commit and summarize

```bash
git add demo_api_server/config/verticals/<vertical-id>/ \
        demo_api_server/services/nlIntentParser.js \
        docs/HELIX_AGENT_DIRECTIVES.json \
        docs/HELIX_AGENT_DIRECTIVES_CONSOLE.md
git commit --no-verify -m "feat(verticals): add <Brand Name> vertical (manifest + routing + Helix)"
```

Then tell the user:

1. The vertical is live after a server restart (manifests are scanned at startup). To pick it up without a full restart, the running server can `loader.reload('<vertical-id>')` via the verticals admin route; otherwise restart with `./run.sh`.
2. Switch to it via the vertical switcher in the UI, or `POST /api/verticals/active` (admin-gated, body `{ "id": "<vertical-id>" }`).
3. If a logoPath was set: copy the image to `demo_api_ui/public/branding/<filename>` — the UI falls back to text until it's there.
4. The `featureScope` (`<scope>`) is declared in the manifest but not yet provisioned in PingOne — it is created the next time `npm run pingone:bootstrap` runs.
5. Heuristic routing, themed chips, hero stats, and `llmChipGroups` work immediately. Helix routing works once the directive is pasted into the Helix console (the console .md section is the copy source).
6. **If a `featurePage` was declared (Q11 Option A):** the `feature` chip renders but shows an empty state until the backend is wired — complete Step 9.

---

## Step 9 — (Optional) Wire the feature-page backend

Only if the user declared a `featurePage` and wants it to return real data. The feature page is served over the **API-key path** through the MCP gateway, NOT by `mock-data.json` and NOT by the MCP server's tool handlers (the `show_*` handlers are registered for visibility but the gateway intercepts the call). Until the backend is wired the chip shows the manifest's `scopeError` / empty state — which is correct behavior — so this is safe to defer.

Follow the **"wire the feature-page backend"** section of the `add-vertical` skill — it lists the backend-endpoint + gateway-routing + MCP-registry edit points (with searchable symbol anchors) and the build/provision steps. This is a cross-service change spanning the gateway, the MCP registry, and a backend service: treat it as its own task, read the `mcp-gateway` and `mcp-server` skills first, and consult `REGRESSION_PLAN.md` for the gateway/registry files.
