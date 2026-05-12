# Deferred Items — Phase 266

Pre-existing test failures discovered during Plan 04 execution (out of scope per deviation rules):

## App.session.test.js — pre-existing failure
- File: `banking_api_ui/src/__tests__/App.session.test.js`
- Root cause: `Phase266ArchitecturePage.jsx` (committed at `dcaefaa5`) uses ESM import
  syntax that CRA/Jest cannot transform (`Cannot use import statement outside a module`).
- Introduced by: commit `dcaefaa5 feat(architecture): add Phase 266 three-paths architecture page`
- Not caused by Plan 04 changes.
- Fix: add `Phase266ArchitecturePage.jsx` path to `transformIgnorePatterns` in package.json,
  or convert the file to CommonJS-compatible imports, or mock it in App.session.test.js.

## uiRegression.test.js — pre-existing CSS/JS monospace violations
- File: `banking_api_ui/src/__tests__/uiRegression.test.js`
- Violations in: `MortgagePathPage.css`, `Phase266ArchitecturePage.css`, `ActivityLogs.js`,
  `SequenceDiagramPage.js`, `SetupWizard.js`
- None of these files were modified by Plan 04.
- Fix: add those files to the skip list in `uiRegression.test.js` or replace monospace
  with CSS variables per project convention.
