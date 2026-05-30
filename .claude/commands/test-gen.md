---
description: Generate tests for a banking-demo file, matching the project's regression/integration two-tier pattern
allowed-tools: Read, Write, Bash(cat package.json), Bash(ls), Bash(npx jest *), Glob
argument-hint: [filepath] [--coverage-gaps] [--regression-only|--integration-only]
---

Generate tests for `$1`.

1. **Read the file** and identify:
   - Exported functions and their signatures.
   - Edge cases (boundary conditions, empty inputs, max amounts).
   - Error paths (validation failures, missing fields, unauthorized).
   - Integration points (`configStore`, `dataStore`, `transactionConsentChallenge`, OAuth, MCP).

2. **Detect the test framework** from the nearest `package.json`:
   - `banking_api_server/` → Jest (CommonJS, mocks via `jest.mock`).
   - `banking_api_ui/` → React Testing Library + Jest (CRA defaults).
   - `banking_mcp_server/` → ts-jest.

3. **Match the existing test style** in the sibling `__tests__/` folder. Read 1–2 nearby tests first.

4. **For critical HTTP routes** (OAuth, HITL, transactions) — follow the **two-tier pattern** from CLAUDE.md:

   **`<name>.regression.test.js`** — fast, isolated:
   ```javascript
   jest.mock('../../services/configStore', () => ({
     getEffective: jest.fn((key) => {
       const defaults = { 'ff_hitl_enabled': 'true', 'confirm_threshold_usd': '500' };
       return defaults[key] || null;
     }),
   }));
   ```

   **`<name>.integration.test.js`** — uses real `.env`:
   ```javascript
   // configStore NOT mocked — uses real .env
   jest.mock('../../middleware/auth', () => ({ /* ... */ }));
   jest.mock('../../data/store', () => ({ /* ... */ }));
   // No mock on configStore
   ```

5. **If `--coverage-gaps`** is passed: run existing tests first with `--coverage` and only generate tests for uncovered branches.

6. **Do not test implementation details** — test observable behavior (HTTP status, response shape, side effects on the data store).

7. Output the generated test file(s), then a one-line command to run them:
   ```
   npx jest <test-file-path>
   ```
