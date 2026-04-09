---
Phase: 114
Plan: 02
Objective: Register IETFStandardsPanel in EducationPanelsHost and wire SideNav integration
Status: Complete
Commits: c6362f5
Completion_Date: 2026-04-09
Time_Estimate: 25min
---

# Plan 02 Summary — EducationPanelsHost Registration + SideNav Integration

**Objective:** Register the IETFStandardsPanel in the education panel host, wire it into education commands, and add it to the SideNav Learn & Explore menu.

---

## What Was Built

### 1. Added IETF_STANDARDS ID to educationIds.js
```javascript
IETF_STANDARDS: 'ietf-standards',  // IETF Standards for Agentic Identity — RFC7523bis, Identity Chaining, JAG-IR, AIMS, WIMSE, SD-JWT VC, PQ/T JOSE
```

### 2. Registered Panel in EducationPanelsHost.js
- Imported `IETFStandardsPanel` component
- Added render entry: `<IETFStandardsPanel isOpen={panel === EDU.IETF_STANDARDS} onClose={close} initialTabId={tab} />`

### 3. Added Commands to educationCommands.js
- Main command: `{ id: 'ietf-standards', label: '⭐ IETF Standards: Agentic Identity', panel: EDU.IETF_STANDARDS, tab: 'overview' }`
- Tab-specific commands for all 8 tabs (RFC7523bis, Identity Chaining, JAG-IR, AIMS, WIMSE, SD-JWT VC, PQ/T JOSE)

### 4. Wired SideNav Menu Item
- Added to LEARN_ITEMS array: `{ label: '⭐ IETF Standards', icon: '📖', action: () => edu?.open(EDU.IETF_STANDARDS, 'overview') }`
- Displays in Learn & Explore section with 📖 icon

---

## Key Artifacts

| File | Changes | Role |
|------|---------|------|
| `banking_api_ui/src/components/education/educationIds.js` | +1 line | Register IETF_STANDARDS ID |
| `banking_api_ui/src/components/education/EducationPanelsHost.js` | +1 import, +1 JSX | Mount IETFStandardsPanel in host |
| `banking_api_ui/src/components/education/educationCommands.js` | +8 lines | Register 8 education commands |
| `banking_api_ui/src/components/SideNav.js` | +1 line | Add SideNav menu item |

---

## Build Validation

```
npm run build
✓ Compiled successfully
✓ Bundle: +3.38 kB (from Plan 01 component)
✓ Exit code: 0
```

---

## Requirements Coverage

| Requirement ID | Coverage | Notes |
|----------------|----------|-------|
| IETF-EDU-02 | ✅ Full | Panel registered in EducationPanelsHost, wired to SideNav and commands |

---

## Verification Results

✅ IETF_STANDARDS ID available in EDU object  
✅ Panel mounts correctly in EducationPanelsHost  
✅ All 8 command entries valid (overview + 7 tab specific)  
✅ SideNav menu item displays with correct icon  
✅ Clicking menu item opens overview tab  
✅ Build passes with exit code 0

---

## Self-Check: PASSED

All 4 files updated, panel integrated into education host, commands registered, SideNav wired. Build validated.

