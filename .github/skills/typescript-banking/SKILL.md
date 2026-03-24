---
name: typescript-banking
description: 'TypeScript and JavaScript coding standards for BX Finance banking demo. USE FOR: strict TypeScript, eliminate any types, type errors, ESLint rules, CJS vs ESM modules, async/await patterns, React JSX components, React hooks, jest unit tests, interface vs type alias, generics, null safety, module imports, banking_mcp_server TypeScript, banking_api_server JavaScript, banking_api_ui React. DO NOT USE FOR: OAuth flows (use oauth-pingone); Vercel deployment config (use vercel-banking); PingOne Management API calls (use pingone-api-calls).'
argument-hint: 'Describe the code you are writing or the type/pattern question you have'
---

# TypeScript / JavaScript Development — BX Finance Banking Demo

## Project Language Map

| Package | Language | Runtime | Entry |
|---------|----------|---------|-------|
| `banking_mcp_server` | **TypeScript** (strict) | Node 18+ / ts-node | `src/index.ts` → `dist/index.js` |
| `banking_api_server` | **JavaScript** (ES2020, CommonJS) | Node 18+ | `server.js` |
| `banking_api_ui` | **JavaScript + JSX** (React 18, CRA) | Browser | `src/index.js` |

---

## TypeScript — banking_mcp_server

### tsconfig Key Settings

```jsonc
{
  "target": "ES2020",
  "module": "commonjs",
  "strict": true,
  "esModuleInterop": true,
  "declaration": true,
  "sourceMap": true,
  "experimentalDecorators": true,
  "emitDecoratorMetadata": true,
  "outDir": "./dist",
  "rootDir": "./src"
}
```

### Scripts

```bash
npm run build          # tsc (incremental)
npm run build:clean    # rm -rf dist && tsc
npm run dev            # nodemon + ts-node (watch mode)
npm run typecheck      # tsc --noEmit
npm run lint           # eslint src/**/*.ts
npm run lint:fix       # eslint --fix
npm run test           # jest --forceExit
npm run validate       # typecheck + lint + test:ci (run before committing)
```

### Type Definitions

Always import from the barrel `../types` or `../interfaces/*`:

```typescript
import { BankAccount, Transaction, TransferRequest, TransferResult } from '../types/banking';
import { Session, AuthErrorCodes, AuthenticationError } from '../interfaces/auth';
import { ToolResult, AuthorizationRequest } from '../interfaces/mcp';
```

**Core banking types:**

```typescript
interface BankAccount {
  accountId: string;
  accountNumber: string;
  accountType: 'checking' | 'savings' | 'credit' | 'investment';
  balance: number;
  currency: string;
  status: 'active' | 'inactive' | 'frozen';
  ownerId: string;
}

interface Transaction {
  transactionId: string;
  accountId: string;
  amount: number;
  currency: string;
  type: 'debit' | 'credit';
  category: string;
  description: string;
  timestamp: Date;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  metadata?: Record<string, unknown>;  // use unknown, never any
}
```

### Class Patterns

Constructor injection for all dependencies:

```typescript
export class BankingToolProvider {
  private authChallengeHandler: AuthorizationChallengeHandler;

  constructor(
    private apiClient: BankingAPIClient,
    private authManager: BankingAuthenticationManager,
    private sessionManager: BankingSessionManager,
  ) {
    this.authChallengeHandler = new AuthorizationChallengeHandler(authManager, sessionManager);
  }

  async executeTool(
    toolName: string,
    params: Record<string, unknown>,
    session: Session,
    agentToken?: string,
  ): Promise<BankingToolResult> { /* ... */ }
}
```

### Error Handling

```typescript
import { AuthenticationError } from '../interfaces/auth';
import { BankingAPIError } from '../interfaces/banking';

try {
  const result = await this.apiClient.transfer(request);
  return { type: 'text', text: JSON.stringify(result), success: true };
} catch (err) {
  if (err instanceof AuthenticationError) {
    const challenge = await this.authChallengeHandler.handle(err, session);
    return { type: 'text', text: 'Authorization required', authChallenge: challenge };
  }
  if (err instanceof BankingAPIError) {
    return { type: 'text', text: `Banking error: ${err.message}`, success: false };
  }
  throw err; // re-throw unexpected errors
}
```

### Strict TypeScript Rules

- **Never use `any`** — use `unknown` and narrow with type guards, or use the correct domain type
- **No non-null assertion (`!`)** without a comment explaining why it's safe
- Use `Record<string, unknown>` for arbitrary objects — not `object` or `{}`
- Use discriminated unions for state machines
- Mark all async functions with explicit return types: `Promise<BankingToolResult>`
- Prefer `interface` over `type` for object shapes; use `type` for unions/intersections

```typescript
// ✅ Good
function processStatus(status: 'pending' | 'completed' | 'failed'): string {
  switch (status) {
    case 'pending':   return 'Processing...';
    case 'completed': return 'Done';
    case 'failed':    return 'Failed';
    // TypeScript enforces exhaustiveness — no default needed
  }
}
// ❌ Bad
function processStatus(status: any): string { /* ... */ }
```

### Logging

```typescript
import { Logger } from '../utils/Logger';
const logger = new Logger('[BankingToolProvider]');

logger.info(`Tool execution: ${toolName}`, { sessionId, toolName });
logger.error(`Tool failed: ${toolName}`, { error: err.message, sessionId });
// Never log raw tokens or credentials
```

---

## JavaScript — banking_api_server

### Module Pattern

CommonJS only — do **not** use ESM `import`/`export`:

```javascript
'use strict';

const express = require('express');
const router = express.Router();
const oauthService = require('../services/oauthService');
const configStore = require('../services/configStore');

// ...

module.exports = router;
```

### Async Route Handlers

Always `async/await` + try/catch. Never `.then()` chains.

```javascript
router.post('/transfer', authenticateToken, async (req, res) => {
  try {
    const { fromAccountId, toAccountId, amount } = req.body;
    if (!fromAccountId || !toAccountId || !amount) {
      return res.status(400).json({ error: 'missing_fields' });
    }
    const result = await bankingService.transfer({ fromAccountId, toAccountId, amount });
    res.json(result);
  } catch (err) {
    console.error('[transfer] Error:', err.message);
    res.status(500).json({ error: 'transfer_failed', message: err.message });
  }
});
```

### Session / BFF Pattern

Tokens stored **only** in `req.session` — never sent to the browser:

```javascript
// ✅ Store in session
req.session.oauthTokens = tokens;
req.session.user = userClaims;
req.session.oauthType = 'admin'; // or 'user'

// ❌ Never
res.json({ access_token: tokens.access_token });
```

### Input Validation

Validate at API boundaries only (user input, external APIs). Do not add defensive validation for internal function calls.

```javascript
const { username } = req.body;
if (!username || typeof username !== 'string' || username.length > 100) {
  return res.status(400).json({ error: 'invalid_username' });
}
```

### Correlation IDs

```javascript
const correlationId = req.headers['x-correlation-id'] || crypto.randomUUID();
req.correlationId = correlationId;
res.setHeader('x-correlation-id', correlationId);
```

---

## JavaScript/JSX — banking_api_ui (React)

### Component Pattern

Functional components with hooks only. No class components.

```jsx
import React, { useState, useEffect, useCallback } from 'react';

export default function AccountList({ userId }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAccounts = useCallback(async () => {
    try {
      const resp = await fetch(`/api/accounts?userId=${encodeURIComponent(userId)}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      setAccounts(await resp.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  if (loading) return <div className="loading-spinner" />;
  if (error)   return <div className="error-message">{error}</div>;
  return <ul>{accounts.map(a => <AccountCard key={a.accountId} account={a} />)}</ul>;
}
```

### API Calls

Always use the service layer (`src/services/`) — never `fetch` directly in components:

```javascript
// src/services/accountService.js
export async function getAccounts() {
  const resp = await fetch('/api/accounts', { credentials: 'include' });
  if (!resp.ok) throw new Error(`Failed to load accounts: ${resp.status}`);
  return resp.json();
}
```

### CSS / Styling

- Each component has a co-located `.css` file: `BankingAgent.css` next to `BankingAgent.js`
- Use BEM-style class names: `.banking-agent__header`, `.banking-agent__body--loading`
- Logo: always `/logo.svg` (served from `public/`)

### Education / Documentation Components

Use structured JSX — **not** raw text in `<pre>` blocks:

```jsx
// ✅ Good — structured prose
<section className="edu-section">
  <h3>How PKCE Works</h3>
  <ol>
    <li>Generate a random <code>code_verifier</code></li>
    <li>Hash it with SHA-256 → <code>code_challenge</code></li>
    <li>Send <code>code_challenge</code> in the authorization request</li>
    <li>Send <code>code_verifier</code> in the token exchange</li>
  </ol>
</section>

// ❌ Bad — prose dump in pre
<pre>{`PKCE works by... verifier... challenge...`}</pre>
```

---

## General Rules (All Files)

- **No `console.log` with raw tokens, passwords, or PII.** Log event type and metadata only.
- **No `TODO` comments** in committed code — fix it or open a GitHub issue.
- **Prefer composition over inheritance** — use utilities from `src/utils/` (Logger, ErrorHandler, RetryManager, CircuitBreaker).
- **Security:** Never hardcode credentials. All secrets come from `process.env` or `configStore`.
- **Testing:** Unit tests in `tests/unit/`, integration tests in `tests/integration/`. Run `npm run validate` before committing to `banking_mcp_server`.
