# 115-03 Task 4: Patch Delivery Package

## 📦 Deliverables

**Total Files:** 4  
**Total Size:** ~33 KB  
**Format:** Unified Diff (.patch) + Markdown guides  
**Status:** Ready for Application  

---

## 📄 Files Included

### 1. **115-03-BankingAgent-LangChain.patch** (13 KB)
**Purpose:** Main component modifications  
**Changes:**
- Add LangChain client service imports
- Add 6 new state variables for HITL consent flow
- Add `handleHitlConsent()` helper function
- Add `recordConsentDecision()` helper function
- Replace `handleNaturalLanguage()` with LangChain-first logic
- Add HITL consent modal JSX (overlay + form)

**Application:** `git apply 115-03-BankingAgent-LangChain.patch`

### 2. **115-03-BankingAgent-CSS.patch** (2.1 KB)
**Purpose:** HITL modal styling  
**Classes Added:**
- `.ba-modal-overlay` — Dark backdrop
- `.ba-modal-content` — Card container
- `.ba-modal-header` / `.ba-modal-body` / `.ba-modal-footer` — Sections
- `.ba-consent-operation` — Operation details container
- `.ba-consent-detail` — Detail rows (tool, amount, description)
- `.ba-button` / `.ba-button--primary` / `.ba-button--secondary` — Buttons

**Application:** `git apply 115-03-BankingAgent-CSS.patch`

### 3. **115-03-PATCH-INSTRUCTIONS.md** (13 KB)
**Purpose:** Detailed manual and automated application guide  
**Sections:**
- Overview of changes
- Two application methods (automated + manual)
- Step-by-step manual instructions for each code section
- Verification checklist
- Testing procedures
- Rollback instructions

**Read This First:** If applying manually or troubleshooting conflicts

### 4. **115-03-PATCH-README.md** (5.3 KB)
**Purpose:** Quick reference and summary  
**Sections:**
- Quick start commands
- What gets modified (summary table)
- Flow diagrams (user → BFF → LangChain)
- Testing checklist
- Debugging guide
- Related files reference

**Read This:** For overview and quick start

---

## 🚀 Quick Application

```bash
cd /Users/cmuir/P1Import-apps/Banking

# Apply both patches
git apply 115-03-BankingAgent-LangChain.patch
git apply 115-03-BankingAgent-CSS.patch

# Verify compilation
npm run build --prefix banking_api_ui
echo "Exit code: $?"  # Should be 0
```

**Expected Output:**
```
> npm run build

> banking_api_ui@0.1.0 build
> react-scripts build

[Success] Compiled successfully ✓
```

---

## 📋 What These Patches Do

### Integration Flow

```
Natural Language Query
         ↓
    (new) handleNaturalLanguage()
         ↓
    ┌────────────────┐
    │  Try LangChain │
    └────────────────┘
         ↓
    ┌──────────────────────────┐
    │ Response?  428 Required? │
    └──────────────────────────┘
         ↓            ↓
      Success      HITL Modal
         ↓            ↓
   Display        handleHitlConsent()
   Response       Show Modal
   + TokenEvents  User Decides
         ↓            ↓
                 recordConsentDecision()
                 Approve? → Retry
                 Reject → Cancel
```

### Components Modified

| File | Lines Changed | Purpose |
|------|----------------|---------|
| BankingAgent.js | +150 | Imports, state, functions, modal JSX |
| BankingAgent.css | +100 | Modal styling + button variants |

### Component Integration Points

**New State (7 items):**
- `consentId` — Operation consent identifier
- `consentPending` — Modal visibility
- `consentOperation` — Operation data
- `tokenEventsForConsent` — Token exchange events
- `useLangChainAgent` — Feature flag (ready for future use)
- `lastNlMessage` — Query tracking
- `lastNlMessageRef` — Closure ref for state access

**New Functions (2):**
- `handleHitlConsent()` — Extract & display consent requests
- `recordConsentDecision()` — Process user decision + retry

**Modified Functions (1):**
- `handleNaturalLanguage()` — Route via LangChain first, fallback to legacy

**New JSX (1 modal):**
- HITL Consent Modal — Overlay with operation details & buttons

---

## ✅ Verification Steps

### 1. Patches Apply Cleanly
```bash
git apply 115-03-BankingAgent-LangChain.patch
git apply 115-03-BankingAgent-CSS.patch
# Both should exit with code 0, no conflicts
```

### 2. Build Succeeds
```bash
npm run build --prefix banking_api_ui
# Should exit with code 0
```

### 3. Functional Tests
- [ ] Query: "Show my accounts" → LangChain response
- [ ] Query: "Transfer $600..." → HITL modal appears
- [ ] Button: Approve → Operation continues
- [ ] Button: Reject → Operation cancels
- [ ] Token events display after approval

---

## 📞 Troubleshooting

### Conflict During `git apply`
**Solution:** Use manual application (PATCH-INSTRUCTIONS.md, Option 2)

```bash
# Or prefer three-way merge
git apply --3way 115-03-BankingAgent-LangChain.patch
```

### Build Error: "Cannot find module"
**Solution:** Verify LangChain client service exists

```bash
ls -l banking_api_ui/src/services/bankingAgentLangChainClientService.js
```

### Modal Not Appearing
**Solution:** Verify CSS patch applied

```bash
grep "ba-modal-overlay" banking_api_ui/src/components/BankingAgent.css
```

### Import Errors After Patching
**Solution:** Clear node_modules and reinstall

```bash
rm -rf banking_api_ui/node_modules
npm install --prefix banking_api_ui
npm run build --prefix banking_api_ui
```

---

## 🔗 Context & Dependencies

**Prerequisites (Already Complete):**
- ✅ Plan 115-01: LangChain foundation + MCP tools
- ✅ Plan 115-02: OAuth middleware + RFC 8693 token exchange
- ✅ Plan 115-03 Tasks 1-3: HITL infrastructure + client service

**Created by These Patches:**
- ✅ Plan 115-03 Task 4: React component integration + HITL modal

**Next Steps:**
- Checkpoint verification (curl API tests)
- Phase 115 full verification (gsd-verifier checks)
- Phase 115 completion & ROADMAP update

---

## 📝 How to Use This Package

**For Automated Application:**
1. Copy both `.patch` files to the repository root
2. Run: `git apply 115-03-BankingAgent-LangChain.patch`
3. Run: `git apply 115-03-BankingAgent-CSS.patch`
4. Verify: `npm run build --prefix banking_api_ui`

**For Manual Application:**
1. Read: `115-03-PATCH-INSTRUCTIONS.md` (§"Option 2")
2. Follow step-by-step instructions for each section
3. Apply changes to:
   - `banking_api_ui/src/components/BankingAgent.js` (imports, state, functions, JSX)
   - `banking_api_ui/src/components/BankingAgent.css` (append CSS)
4. Verify: `npm run build --prefix banking_api_ui`

**For Troubleshooting:**
1. Start: `115-03-PATCH-README.md` (§"Debugging")
2. Details: `115-03-PATCH-INSTRUCTIONS.md` (§"Verification")

---

## 📊 Statistics

| Metric | Value |
|--------|-------|
| Total Patch Lines | ~650 |
| New State Variables | 7 |
| New Functions | 2 |
| Modified Functions | 1 |
| New CSS Classes | 8 |
| New JSX Components | 1 (modal) |
| Estimated Compile Time | 10-15s |
| File Size Impact | +250 lines BankingAgent.js, +100 lines CSS |

---

## 🎯 Success Criteria

- [ ] Patches apply without conflicts
- [ ] `npm run build` exits with code 0
- [ ] Component renders without console errors
- [ ] LangChain queries display responses
- [ ] High-value operations show HITL modal
- [ ] Approve/Reject buttons functional
- [ ] Token events display correctly
- [ ] Fallback to legacy NL parser works

---

## 📮 Summary

This patch package completes Plan 115-03 Task 4 (BankingAgent component integration). It wires the LangChain client service into the existing React component, adding:

1. **LangChain Router** — Routes NL queries to LangChain service first
2. **HITL Consent Gates** — Shows approval modal for high-value operations (>$500)
3. **Token Event Display** — Shows RFC 8693 token exchange details
4. **Graceful Fallback** — Falls back to legacy NL parser if LangChain unavailable
5. **Professional UI** — Styled modal with operation details and buttons

**Total Implementation:** ~400 lines of code + styling  
**Complexity:** Medium (integrates 3 prior services + React state management)  
**Risk Level:** Low (existing functions preserved, new code isolated)  
**Testing Required:** Functional testing (LangChain queries, HITL modal, fallback)

---

**Version:** 1.0  
**Created:** 2026-04-09  
**Phase:** 115 (Agent Framework Integration)  
**Status:** ✅ Ready for Application
