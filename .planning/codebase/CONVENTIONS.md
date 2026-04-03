# Coding Conventions

**Analysis Date:** 2026-03-31

## Module Systems by Package

**`banking_api_server` (Node.js / Express):**
- CommonJS: `require()` / `module.exports = { ... }`
- Some files open with `'use strict';`
- No ES module syntax; no `.mjs` files

**`banking_api_ui` (React CRA):**
- ES modules: `import` / `export default` / named `export`
- JSX in `.js` files (not `.jsx`)

**`banking_mcp_server` (TypeScript):**
- ES module syntax compiled to CJS via `tsconfig.json`
- Barrel `index.ts` files in each subdirectory re-export everything: `export * from './server'`

---

## Naming Patterns

**Files:**
- `banking_api_server`: camelCase for services/utils (`configStore.js`, `authStateCookie.js`); kebab-case for test files (`oauth-error-handling.test.js`, `runtime-settings-api.test.js`)
- `banking_api_ui`: PascalCase for React components (`Accounts.js`, `BankingAgent.js`); camelCase for hooks (`useDemoMode.js`) and services (`bffAxios.js`, `configService.js`)
- `banking_mcp_server`: PascalCase for class files (`BankingToolProvider.ts`, `BankingSessionManager.ts`)

**Functions:**
- camelCase everywhere: `validateAmount`, `fetchAccounts`, `restoreAccountsFromSnapshot`, `mockAdminSession`

**Variables:**
- camelCase for locals and module-level `const`
- SCREAMING_SNAKE_CASE for feature flags and env-derived booleans: `SKIP_TOKEN_SIGNATURE_VALIDATION`, `DEBUG_TOKENS`, `USE_KV`

**Classes:**
- PascalCase: `OAuthError`, `StructuredLogger`, `BankingToolProvider`, `BankingAPIClient`

**Constants / Enums:**
- Object-as-enum pattern with SCREAMING_SNAKE_CASE values:
  ```js
  const OAUTH_ERROR_TYPES = {
    INVALID_TOKEN: 'invalid_token',
    INSUFFICIENT_SCOPE: 'insufficient_scope',
    ...
  };
  const LOG_CATEGORIES = {
    OAUTH_VALIDATION: 'oauth_validation',
    SCOPE_VALIDATION: 'scope_validation',
    ...
  };
  ```

---

## Code Style

**Formatting:**
- No project-wide Prettier config; `banking_mcp_server/.eslintrc.js` is the only lint config
- Indentation: 2 spaces throughout

**Linting (`banking_mcp_server` only):**
- Parser: `@typescript-eslint/parser`
- Extends: `eslint:recommended` + `plugin:@typescript-eslint/recommended`
- `@typescript-eslint/no-unused-vars`: **error** — prefix ignored params/vars with `_`
- `@typescript-eslint/no-explicit-any`: **off** — `any` is permitted
- `@typescript-eslint/explicit-function-return-type`: **off**
- No lint config for `banking_api_server` or `banking_api_ui` beyond CRA defaults

**`banking_api_ui` ESLint:**
- `react-app` + `react-app/jest` (CRA defaults, configured in `package.json`)

---

## Import Organization

**`banking_api_server` (route files):**
```js
const express = require('express');
const router  = express.Router();
// then data/stores
const dataStore = require('../data/store');
// then middleware
const { authenticateToken, requireScopes } = require('../middleware/auth');
// then services
const configStore = require('../services/configStore');
// then utils
const { logger, LOG_CATEGORIES } = require('../utils/logger');
```

**`banking_api_ui` (React components):**
```js
import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';            // third-party libs
import bffAxios from '../services/bffAxios';  // own services
import { notifyError } from '../utils/appToast';  // own utils
import AdminSubPageShell from './AdminSubPageShell'; // own components
```

**`banking_mcp_server` (TypeScript):**
```ts
import { BankingAPIClient } from '../banking/BankingAPIClient';
import { BankingAuthenticationManager } from '../auth/BankingAuthenticationManager';
import { ToolResult, AuthorizationRequest } from '../interfaces/mcp';
import { Session, AuthErrorCodes } from '../interfaces/auth';
```

**Path Aliases:**
- None defined — all imports use relative paths

---

## Error Handling

**Express routes — standard `try/catch` block:**
```js
router.get('/my', authenticateToken, async (req, res) => {
  try {
    // ... logic
    res.json({ data });
  } catch (error) {
    console.error('Error getting user transactions:', error);
    res.status(500).json({ error: 'Failed to get transactions' });
  }
});
```

**Role/scope guard — early return:**
```js
if (req.user.role !== 'admin') {
  return res.status(403).json({ error: 'Access denied. Admin role required.' });
}
```

**Auth middleware — `OAuthError` class:**
- `middleware/auth.js` and `middleware/oauthErrorHandler.js` throw `OAuthError` instances
- `OAuthError(type, description, statusCode, additionalData)` — see `OAUTH_ERROR_TYPES`
- `formatOAuthErrorResponse(error, req)` serializes to RFC 6749 shape with `timestamp`, `request_id`, `path`, `method`

**React components — toast helpers:**
```js
} catch (error) {
  console.error('Accounts error:', error);
  if (error.response?.status === 401) {
    toastAdminSessionError('Your session has expired...', navigateToAdminOAuthLogin);
  } else if (error.response?.status === 403) {
    notifyError('You do not have permission to view accounts.');
  } else {
    notifyError('Failed to load accounts');
  }
}
```
- `notifyError(msg)` — `src/utils/appToast.js`
- `toastAdminSessionError(msg, navigateFn)` — `src/utils/dashboardToast.js`

**Not used:** Express `next(err)` error propagation — all errors are handled inline in routes.

---

## Logging

**`banking_api_server` routes — `console.*` (not the structured logger):**
```js
console.error('Error getting transactions:', error);
console.warn('[transactions] restoreAccountsFromSnapshot failed:', e.message);
console.log(`💰 [Transaction] Transfer created by ${req.user.username} ...`);
```
- Route-level prefix in brackets: `[transactions]`, `[StepUp]`, `[Authorize]`, `[ConsentChallenge]`
- Emoji prefixes on business-significant events (transactions, step-up)

**`banking_api_server` middleware/services — structured `logger`:**
```js
const { logger, LOG_CATEGORIES } = require('../utils/logger');

logger.warn(LOG_CATEGORIES.SCOPE_VALIDATION, 'Error determining user type from token', {
  error_message: error.message
});
logger.debug(LOG_CATEGORIES.OAUTH_VALIDATION, 'Starting OAuth token validation', {
  method, path, token_length: token.length
});
```
- Signature: `logger.level(category, message, metadata)`
- Categories: `OAUTH_VALIDATION`, `SCOPE_VALIDATION`, `TOKEN_INTROSPECTION`,
  `TOKEN_EXCHANGE`, `PROVIDER_HEALTH`, `AUTHENTICATION`, `AUTHORIZATION`, `ERROR_HANDLING`
- `StructuredLogger` in `utils/logger.js` outputs JSON to console (with color) and optionally to files

**Rule of thumb:**
- Use `logger` + `LOG_CATEGORIES` in middleware and services
- Use `console.*` in route handlers and data-layer helpers

---

## configStore Usage Patterns

`banking_api_server/services/configStore.js` is a singleton.

```js
const configStore = require('../services/configStore');

// Sync read from in-memory cache — safe anywhere
const value = configStore.get('ff_authorize_mcp_first_tool');

// Read with env-var fallback (reads env first, then KV/SQLite)
const uri = configStore.getEffective('mcp_resource_uri');

// Async write — validates then persists
await configStore.setConfig({ admin_client_id: '...' });

// Must be called once before first use in cold-start routes
await configStore.ensureInitialized();
```

- `.get()` is synchronous — safe in middleware and sync route code
- `.getEffective()` resolves: env var → KV/SQLite → default
- Call `await configStore.ensureInitialized()` at the top of routes that may be hit during Vercel cold-start (`mcpInspector.js`, `adminConfig.js`)

---

## Function Design

**Size:** Route handlers can be long (50–100+ lines); business logic helpers are smaller
**Parameters:** Express routes use `(req, res)` or `(req, res, next)`; service helpers take typed args
**Return values:** Routes always end with `res.json(...)` or `res.status(N).json(...)`
**Async:** `async/await` throughout; no callback-style async except session `save(err => {...})`

---

## Comments

**When to comment:**
- File-level JSDoc block describing purpose and key exports (`/** ... */`)
- Complex business logic (step-up thresholds, delegated access RFC 8693)
- Environment variable semantics (audience validation skip logic in `auth.js`)
- TODO in routes for known planned changes

**Do not add:** redundant "this function does X" JSDoc for obvious code

---

## TypeScript (MCP Server)

- `interface` for DTO/data shapes: `ToolResult`, `Session`, `UserTokens`, `BankingAPIError`
- `class` for service implementations: `BankingToolProvider`, `BankingSessionManager`
- `export interface ToolExecutionContext { ... }` — named exports only, no default exports
- Unused params prefixed with `_` to satisfy `no-unused-vars` rule
- `any` type used freely (rule is off); prefer specific types where straightforward

---

*Convention analysis: 2026-03-31*
