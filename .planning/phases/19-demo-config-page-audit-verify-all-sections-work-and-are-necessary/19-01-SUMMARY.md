---
plan: 19-01
phase: 19-demo-config-page-audit-verify-all-sections-work-and-are-necessary
status: complete
completed: "2026-04-02"
commit: 8212709
---

## Summary

Three surgical edits to `DemoDataPage.js` — no new files, no API/CSS changes.

## Tasks Completed

| Task | Result |
|------|--------|
| A: Remove 4 dead functions | ✅ Removed `getAccountRowKey`, `handleAccountChange`, `handleAddAccount`, `handleRemoveDraft` + eslint-disable guards (~15 lines) |
| B: Lesson section accordion | ✅ Wrapped `demo-data-agent-auth-demo` section in `<details>` (collapsed by default) with `🎓 Lesson:` summary |
| C: Wire dark mode to ThemeContext | ✅ Replaced local `dashTheme` state/effects with `const { theme, toggleTheme } = useTheme()` |
| D: Build | ✅ `npm run build` exits 0 |

## Key Files

### Modified
- `banking_api_ui/src/components/DemoDataPage.js` — 39 lines removed, 9 lines added (net -30 lines; 1512 → 1483)

## Verification

```
# Task A: zero dead function refs
grep -c "getAccountRowKey\|handleAccountChange\|handleAddAccount\|handleRemoveDraft" banking_api_ui/src/components/DemoDataPage.js
→ 0

# Task C: zero dashTheme refs
grep -c "dashTheme\|setDashTheme\|handleDashThemeToggle\|bx-dash-theme" banking_api_ui/src/components/DemoDataPage.js
→ 0

# Task C: useTheme wired
grep -n "useTheme\|theme, toggleTheme" banking_api_ui/src/components/DemoDataPage.js
→ line 13: import { useTheme }...
→ line 68: const { theme, toggleTheme } = useTheme()

# Task B: lesson accordion present
grep -n "<details>\|🎓 Lesson:" banking_api_ui/src/components/DemoDataPage.js
→ line 661: <details>
→ line 662:   <summary>🎓 Lesson: how can an AI reach your bank data?</summary>
→ line 845: </details>

# Build
cd banking_api_ui && npm run build → exit 0
```

## Self-Check: PASSED
