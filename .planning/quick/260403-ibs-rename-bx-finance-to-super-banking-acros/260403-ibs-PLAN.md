---
quick_id: 260403-ibs
title: Rename BX Finance to Super Banking across all source files and docs
type: quick
---

## Objective

Replace every occurrence of "BX Finance" with "Super Banking" across docs/, banking_api_ui/src/, banking_api_server/ source files, and root .md files. Skip .planning/ (historical artifacts).

## Tasks

### Task 1: Rename in docs/ and root .md files
- **Action:** `sed -i '' 's/BX Finance/Super Banking/g'` on all .md and .drawio files in docs/ and root *.md
- **Verify:** `grep -r "BX Finance" docs/ *.md` returns 0
- **Done:** No "BX Finance" in docs/ or root markdown

### Task 2: Rename in banking_api_server/ source
- **Files:** routes/ and services/ JS files (12 files identified)
- **Action:** `sed -i '' 's/BX Finance/Super Banking/g'` on each
- **Verify:** `grep -r "BX Finance" banking_api_server/ --include="*.js" --include="*.ts"` returns 0
- **Done:** No "BX Finance" in API server source

### Task 3: Rename in banking_api_ui/src/
- **Files:** All src/ files (21 files identified including snapshots)
- **Action:** `sed -i '' 's/BX Finance/Super Banking/g'` on each
- **Verify:** `grep -r "BX Finance" banking_api_ui/src/` returns 0
- **Done:** No "BX Finance" in UI source; `npm run build` passes

## Success Criteria

- [ ] Zero "BX Finance" occurrences in docs/, root .md, banking_api_server/ source, banking_api_ui/src/
- [ ] `npm run build` exits 0
- [ ] Snapshots updated to match new name
