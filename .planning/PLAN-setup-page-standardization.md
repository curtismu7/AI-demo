# Setup Page Standardization Plan

**Created:** 2026-05-07  
**Status:** Draft — not yet executed  
**Goal:** Consolidate all setup/configuration surfaces into a single, consistent `/configure` page. Remove duplication. Establish one authoritative tab + section structure.

---

## 1. Current State (as of 2026-05-07)

There are **four distinct setup surfaces** in the app today:

### A. `/configure` — UnifiedConfigurationPage.tsx
**The correct home.** All users land here from the new "Setup" button on the landing page.

| Tab ID | Label | Sections |
|--------|-------|----------|
| `quick-start` | Quick Start | pingone-basics, demo-data-setup, industry-branding |
| `pingone-config` | PingOne Setup | pingone-connection, oauth-flows, mfa-settings, token-exchange |
| `demo-management` | Demo Data | demo-setup |
| `llm-ollama` | Ollama Setup | ollama-setup |
| `llm-helix` | Helix Setup | helix-setup |
| `agent-configuration` | Agent Settings | agent-ui-mode, mcp-scopes, mcp-tools, education-settings, token-chain |
| `advanced` | Advanced | debug-settings, api-keys, **custom-chips** *(just added)* |
| `idp-setup` | IDP Setup | idp-setup-guide, idp-overview, idp-clients |
| `feature-flags` | Feature Flags | feature-flags |
| `authorize` | Authorize | authorize-rules |
| `mcp-gateway` | MCP Gateway | mcp-gateway-config |

### B. `/config` — Config.js (OLD page)
**Duplicate/legacy.** Has its own tab bar with different labels. Currently redirects `/config` → `/configure?tab=pingone-config` but the page still exists and has tabs that partially overlap with UnifiedConfigurationPage.

Config.js tab bar:
- `setup` — "Setup Config" (giant CollapsibleCard form — overlaps with pingone-config sections)
- `pingone-config` — renders `<SetupWizardTab />` (PingOne provisioning wizard)
- `scope-mgmt` — "Scope Management" (not in UnifiedConfigurationPage)
- `vercel` — "Vercel Env" (conditional; not in UnifiedConfigurationPage)
- `worker` — "Worker App" (not in UnifiedConfigurationPage — separate `WorkerAppConfigTab`)
- `token-validation` — "Token Validation" (not in UnifiedConfigurationPage)
- `custom-chips` — "Custom Actions" (duplicate — now also in UnifiedConfigurationPage Advanced tab)

### C. `/setup/wizard` — SetupWizard.js
Standalone guided setup wizard for first-time provisioning via Management API. Two-panel layout (form + live SSE log). Accessed via "Setup guide" link in Config.js header. Not integrated into tab structure.

### D. `SetupWizardTab.js` (embedded in Config.js `pingone-config` tab)
The PingOne provisioning wizard embedded inside Config.js. Creates PingOne apps/resources via Management API worker token. Has its own form state separate from the rest of Config.js.

---

## 2. Problems to Solve

1. **Duplicate custom-chips entry** — `CustomChipsTab` now exists in both Config.js (`custom-chips` tab) and UnifiedConfigurationPage (Advanced → Custom Action Chips). Should live only in UnifiedConfigurationPage.

2. **Config.js Setup Config tab** — Massive CollapsibleCard form that duplicates much of what's in UnifiedConfigurationPage `pingone-config` tab. Source of truth is unclear.

3. **Missing tabs in UnifiedConfigurationPage** — Several Config.js tabs have no equivalent:
   - Scope Management (`scope-mgmt`)
   - Vercel Env (`vercel`)
   - Worker App (`worker`)
   - Token Validation (`token-validation`)

4. **Two wizards** — `SetupWizard.js` (standalone at `/setup/wizard`) vs `SetupWizardTab.js` (embedded in Config.js). Neither is integrated into UnifiedConfigurationPage.

5. **Inconsistent navigation** — Some admin sidebar links go to `/config`, others to `/configure`. No single authoritative path.

6. **LandingPage "Setup" button** — Now points to `/configure` (correct). But header still shows old Config.js links in some places.

---

## 3. Target State

**Single source of truth:** `/configure` (UnifiedConfigurationPage.tsx)

All configuration lives under `/configure?tab=<id>`. Config.js becomes a redirect shell only (or is retired entirely).

### Proposed final tab structure for UnifiedConfigurationPage:

| Tab ID | Label | New? | Sections to add |
|--------|-------|------|-----------------|
| `quick-start` | Quick Start | existing | — |
| `pingone-config` | PingOne Setup | existing | Merge Config.js "Setup Config" fields |
| `demo-management` | Demo Data | existing | — |
| `llm-ollama` | Ollama Setup | existing | — |
| `llm-helix` | Helix Setup | existing | — |
| `agent-configuration` | Agent Settings | existing | — |
| `advanced` | Advanced | existing | custom-chips ✅ done; add scope-mgmt, vercel (conditional), token-validation |
| `worker-app` | Worker App | **new** | Move WorkerAppConfigTab content here |
| `idp-setup` | IDP Setup | existing | — |
| `feature-flags` | Feature Flags | existing | — |
| `authorize` | Authorize | existing | — |
| `mcp-gateway` | MCP Gateway | existing | — |

---

## 4. Execution Steps (ordered by priority)

### Step 1 — Remove duplicate custom-chips from Config.js *(quick, low risk)*
- Remove `{ key: "custom-chips", label: "Custom Actions" }` from Config.js tab bar array
- Remove `{activeTab === "custom-chips" && <CustomChipsTab />}` render block
- Remove `import CustomChipsTab` from Config.js
- Canonical location: UnifiedConfigurationPage Advanced → Custom Action Chips

### Step 2 — Add missing tabs to UnifiedConfigurationPage *(medium)*
Move these from Config.js into UnifiedConfigurationPage as new sections under `advanced`:
- **Token Validation** — move `ConfigTokenValidation` component → new section `token-validation` under Advanced tab
- **Scope Management** — move scope mgmt content → new section `scope-mgmt` under Advanced tab (or new top-level tab)
- **Vercel Env** — move `VercelConfigTab` → new section `vercel-env` under Advanced tab (conditional on `hostedOn === "vercel"`)

### Step 3 — Add Worker App tab to UnifiedConfigurationPage *(medium)*
- Add new top-level tab `worker-app` / "Worker App" to `CONFIGURATION_TABS`
- Move `WorkerAppConfigTab` content into a new section render case
- Remove from Config.js

### Step 4 — Integrate SetupWizardTab into UnifiedConfigurationPage *(larger)*
The PingOne provisioning wizard (SetupWizardTab.js) should be accessible from within UnifiedConfigurationPage, not buried in Config.js's `pingone-config` tab.
- Add a "Provision PingOne" section under the `pingone-config` tab
- Or add a new top-level tab `provision` / "Provision PingOne"
- SetupWizard.js at `/setup/wizard` can remain as a standalone route for deep-link use

### Step 5 — Retire/redirect Config.js *(cleanup)*
Once all content is migrated to UnifiedConfigurationPage:
- Replace Config.js body with a `<Navigate to="/configure" />` redirect
- Or keep as a thin shell with just the redirect logic
- Remove orphaned imports (WorkerAppConfigTab, ConfigTokenValidation, VercelConfigTab, CustomChipsTab, SetupWizardTab)
- Update all internal links: `/config` → `/configure`

### Step 6 — Fix navigation references *(cleanup)*
Files to audit for `/config` links:
- `AdminSideNav.jsx` — several sidebar links
- `SideNav.js`
- `TopNav.js`
- `Onboarding.js`
- `AuthorizeConfigPage.jsx`
- Any `href="/config"` or `to="/config"` in JSX

---

## 5. Risk Assessment

| Step | Risk | Mitigation |
|------|------|------------|
| 1 — Remove dupe custom-chips | Low | Simple import/render removal; canonical still works |
| 2 — Move token-validation, scope-mgmt, vercel | Medium | Test each moved component renders correctly in new context |
| 3 — Worker App tab | Medium | WorkerAppConfigTab is self-contained; straightforward move |
| 4 — SetupWizardTab integration | High | Has SSE streaming + Management API calls; test provisioning flow end-to-end |
| 5 — Retire Config.js | Medium | Audit all `/config` links before removing; regression test admin login flow |
| 6 — Nav link cleanup | Low | Grep + replace; easy to verify |

---

## 6. Files Affected

**Primary:**
- `banking_api_ui/src/components/Configuration/UnifiedConfigurationPage.tsx` — main target
- `banking_api_ui/src/components/Config.js` — source of content to migrate, then retire

**Components to migrate (not delete — keep files, just change where they're rendered):**
- `banking_api_ui/src/components/WorkerAppConfigTab.js`
- `banking_api_ui/src/components/ConfigTokenValidation.js` (or similar)
- `banking_api_ui/src/components/VercelConfigTab.js` (or similar)
- `banking_api_ui/src/components/SetupWizardTab.js`
- `banking_api_ui/src/components/CustomChipsTab.js` — already migrated ✅

**Navigation:**
- `banking_api_ui/src/components/AdminSideNav.jsx`
- `banking_api_ui/src/components/SideNav.js`
- `banking_api_ui/src/components/TopNav.js`
- `banking_api_ui/src/App.js` — route for `/config` redirect

---

## 7. Definition of Done

- [ ] `/configure` has all configuration functionality — nothing requires visiting `/config`
- [ ] `/config` redirects to `/configure`
- [ ] No duplicate rendering of any config section
- [ ] `npm run build` exits 0 with no new warnings
- [ ] Admin login → `/admin` → sidebar "Configuration" → `/configure` works end-to-end
- [ ] Custom chips created in Advanced tab appear in agent sidebar and BankingChips popout
- [ ] SetupWizard (PingOne provisioning) is reachable from within `/configure`
- [ ] No broken links to `/config` in the UI

---

## 8. What Was Done This Session (2026-05-07)

- **Custom chips feature**: `useCustomChips` hook, `CustomChipsTab` component, wired into `BankingAgent.js` (all 3 agent UIs), `BankingChips.jsx` (discovery popout), and `UnifiedConfigurationPage.tsx` Advanced tab
- **AI chip routing fix**: All LLM/AI chips now route through `callMcpTool("sequential_think")` — full RFC 8693 pipeline including `olb-resource-token`
- **Setup button on landing page**: Added to both header nav and hero CTA section, navigating to `/configure`
- **Custom chips placement**: Now correctly in UnifiedConfigurationPage (`/configure` → Advanced → Custom Action Chips) — the page users actually visit
