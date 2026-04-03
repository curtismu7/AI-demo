# Testing Patterns

**Analysis Date:** 2026-03-31

## Overview

Three distinct testing setups exist across the monorepo:

| Package | Framework | Location | Test count |
|---------|-----------|----------|------------|
| `banking_api_server` | Jest (Node) | `src/__tests__/**/*.test.js` + `tests/` | ~25 files |
| `banking_mcp_server` | Jest + ts-jest | `tests/**/*.test.ts` | ~10 files |
| `banking_api_ui` | CRA Jest + Playwright | `src/**/__tests__/` + `tests/e2e/` | ~10 unit + 9 e2e |

---

## banking_api_server — Jest

### Framework

- **Runner:** Jest
- **Config:** `banking_api_server/jest.config.js`
- **Assertion:** Jest built-in
- **HTTP testing:** `supertest`

```js
// jest.config.js highlights
module.exports = {
  testEnvironment: 'node',
  maxWorkers: process.env.CI === 'true' ? 2 : undefined,
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.js'],
  collectCoverageFrom: ['middleware/**/*.js', 'routes/**/*.js', 'services/**/*.js'],
  testMatch: ['**/src/__tests__/**/*.test.js'],
  verbose: true,
  silent: true, // suppress console during tests
};
```

### Run Commands

```bash
cd banking_api_server
npm test                  # jest --forceExit (all tests)
npm run test:unit         # focused subset: step-up-gate, authorize-gate, etc.
npm run test:auth         # auth/oauth tests only
npm run test:all          # jest --forceExit --verbose
npm run test:watch        # jest --watch
npm run test:coverage     # jest --forceExit --coverage
```

### Test File Organization

- **Location:** `src/__tests__/*.test.js` — most tests live here
- **Integration subdirectory:** `src/__tests__/integration/completeFlow.test.js`
- **Standalone utility:** `tests/amountValidation.test.js` — pure unit tests with no server

**Naming:** kebab-case matching the feature (`oauth-error-handling.test.js`, `actClaimValidator.test.js`, `mcpToolAuthorizationService.test.js`)

### Setup File

`src/__tests__/setup.js` runs before every test file via `setupFilesAfterEnv`:

```js
// Sets all required env vars before any module is require()'d
process.env.NODE_ENV = 'test';
process.env.SKIP_TOKEN_SIGNATURE_VALIDATION = 'true';
process.env.SESSION_SECRET = 'test-session-secret';
process.env.OAUTH_CLIENT_ID = 'test-client-id';
process.env.OAUTH_ISSUER = 'https://auth.pingone.com/test-env';

jest.setTimeout(30000);

// Global JWT factory for tests
global.createMockOAuthToken = (scopes, userInfo = {}) => { ... };

// Silence console unless VERBOSE_TESTS=true
console.log = (...args) => {
  if (process.env.VERBOSE_TESTS === 'true') originalConsoleLog(...args);
};
```

### Test Structure

```js
describe('Health Endpoints', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use('/health', healthRouter);
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.PINGONE_JWKS_URI;
  });

  describe('GET /health/live', () => {
    it('should return 200 with alive status', async () => {
      const response = await request(app).get('/health/live').expect(200);
      expect(response.body.status).toBe('alive');
    });
  });
});
```

### Mocking

**Logger — always mock (prevent output):**
```js
jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));
```

**configStore — mock then configure per test:**
```js
jest.mock('../../services/configStore');
const configStore = require('../../services/configStore');

beforeEach(() => {
  jest.clearAllMocks();
  configStore.get.mockImplementation(() => null);
  configStore.getEffective = (k) => configStore.get(k);
});

it('feature flag off', async () => {
  configStore.get.mockReturnValue(null);
  // ...
});

it('feature flag on', async () => {
  configStore.get.mockImplementation((k) =>
    k === 'ff_authorize_mcp_first_tool' ? 'true' : null,
  );
  // ...
});
```

**External services (axios, PingOne):**
```js
jest.mock('axios');
axios.get.mockResolvedValue({ status: 200, data: {} });
axios.get.mockRejectedValue(new Error('Network error'));
```

**Supertest HTTP tests:**
```js
const request = require('supertest');
const app = require('../../server');

it('should return 401 for missing token', async () => {
  const response = await request(app)
    .get('/api/accounts')
    .expect(401);
  expect(response.body).toMatchObject({
    error: OAUTH_ERROR_TYPES.AUTHENTICATION_REQUIRED,
    timestamp: expect.any(String),
    path: '/api/accounts',
  });
});
```

**In-process (no HTTP) helper pattern:**
```js
function mockRes() {
  let cookie = undefined;
  return {
    getHeader: (name) => (name.toLowerCase() === 'set-cookie' ? cookie : undefined),
    setHeader: (name, value) => { if (name.toLowerCase() === 'set-cookie') cookie = value; },
    getCookie: () => cookie,
  };
}

function mockReq(cookieHeader = '') {
  return { headers: { cookie: cookieHeader }, session: {} };
}
```

### JWT Test Helper

```js
// From setup.js — creates a base64-encoded test JWT (not HMAC-signed)
const token = global.createMockOAuthToken(['banking:read', 'banking:write'], {
  id: 'user-123',
  username: 'testuser',
});

// Local helper pattern in some test files:
function jwtWithPayload(payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `eyJhbGciOiJub25lIn0.${body}.x`;
}
```

`SKIP_TOKEN_SIGNATURE_VALIDATION=true` is set in setup.js so these unsigned tokens pass validation.

### Coverage

- **Target directories:** `middleware/`, `routes/`, `services/`
- **View coverage:** `npm run test:coverage` → reports in `coverage/`
- **No enforced threshold** in config

---

## banking_mcp_server — Jest + ts-jest

### Framework

- **Runner:** Jest + ts-jest
- **Config:** `banking_mcp_server/jest.config.js`
- **Assertion:** Jest built-in

```js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: { '^.+\\.ts$': 'ts-jest' },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
};
```

### Run Commands

```bash
cd banking_mcp_server
npm test                  # NODE_ENV=test jest --forceExit
npm run test:coverage     # jest --forceExit --coverage
```

### Test File Organization

- **Location:** `tests/` (separate from `src/`)
- **Structure mirrors `src/`:**
  ```
  tests/
  ├── tools/
  │   ├── BankingToolProvider.test.ts
  │   ├── BankingToolRegistry.test.ts
  │   ├── BankingToolValidator.test.ts
  │   └── AuthorizationChallengeHandler.test.ts
  ├── auth/
  │   └── AuthorizationRequestGenerator.test.ts
  ├── types/
  │   ├── mcp.test.ts
  │   ├── auth-validation.test.ts
  │   ├── banking-validation.test.ts
  │   └── mcp-validation.test.ts
  └── config/
      └── config.test.ts
  ```

### Test Structure

```ts
import { BankingToolProvider } from '../../src/tools/BankingToolProvider';
import { BankingAPIClient } from '../../src/banking/BankingAPIClient';

jest.mock('../../src/banking/BankingAPIClient');
jest.mock('../../src/auth/BankingAuthenticationManager');
jest.mock('../../src/storage/BankingSessionManager');

describe('BankingToolProvider', () => {
  let provider: BankingToolProvider;
  let mockApiClient: jest.Mocked<BankingAPIClient>;

  beforeEach(() => {
    mockApiClient = new BankingAPIClient() as jest.Mocked<BankingAPIClient>;
    provider = new BankingToolProvider(mockApiClient, mockAuthManager, mockSessionManager);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // Helper to set up common mock state:
  const mockSuccessfulAuthorization = () => {
    mockAuthManager.isTokenExpired.mockReturnValue(false);
    mockAuthManager.validateBankingScopes.mockReturnValue(true);
  };
```

### Mocking Pattern (TypeScript)

```ts
// 1. Declare mock at file top
jest.mock('../../src/banking/BankingAPIClient');

// 2. Cast in beforeEach
let mockApiClient: jest.Mocked<BankingAPIClient>;
mockApiClient = new BankingAPIClient() as jest.Mocked<BankingAPIClient>;

// 3. Configure per test
mockApiClient.getAccounts.mockResolvedValue([{ id: 'acc1', balance: 1000 }]);
mockApiClient.getAccounts.mockRejectedValue(new Error('API unavailable'));
```

---

## banking_api_ui — CRA Jest (Unit)

### Framework

- **Runner:** CRA's Jest (via `react-scripts`)
- **Assertion:** `@testing-library/jest-dom`
- **Rendering:** `@testing-library/react`

### Run Commands

```bash
cd banking_api_ui
npm test               # interactive watch mode (CRA default)
npm run test:unit      # react-scripts test --watchAll=false
```

### Test File Organization

- **Location:** co-located with source in `src/**/__tests__/` directories
  ```
  src/context/__tests__/AgentUiModeContext.test.js
  src/context/__tests__/ThemeContext.test.js
  src/utils/__tests__/authUi.test.js
  src/utils/__tests__/bankingAgentFloatingDefaultOpen.test.js
  src/utils/__tests__/embeddedAgentFabVisibility.test.js
  src/components/__tests__/DemoDataPage.test.js
  src/components/__tests__/Header.snapshot.test.js
  src/components/__tests__/SideNav.snapshot.test.js
  src/components/__tests__/CimdSimPanel.test.js
  src/components/shared/__tests__/EducationDrawer.test.js
  ```

### Test Structure

```js
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { AgentUiModeProvider, useAgentUiMode } from '../AgentUiModeContext';

describe('AgentUiModeProvider', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to float-only when localStorage is empty', () => {
    render(
      <AgentUiModeProvider>
        <ModeProbe />
      </AgentUiModeProvider>,
    );
    expect(screen.getByTestId('placement')).toHaveTextContent('none');
  });
});
```

### Mocking Pattern (CRA)

**Service mocks:**
```js
jest.mock('../../services/demoScenarioService', () => ({
  fetchDemoScenario: jest.fn(() => Promise.resolve({})),
  saveDemoScenario: jest.fn(() => Promise.resolve({ ok: true })),
}));
```

**Context mocks:**
```js
jest.mock('../../context/AgentUiModeContext', () => ({
  useAgentUiMode: () => ({ placement: 'none', fab: true, setAgentUi: jest.fn() }),
}));
```

**axios mock (full factory):**
```js
jest.mock('axios', () => {
  const mockClientInstance = () => ({
    get: jest.fn(() => Promise.resolve({ data: {} })),
    post: jest.fn(() => Promise.resolve({ data: {} })),
    interceptors: {
      request: { use: jest.fn(), eject: jest.fn() },
      response: { use: jest.fn(), eject: jest.fn() },
    },
    defaults: { headers: { common: {} } },
  });
  return { __esModule: true, default: { create: jest.fn(() => mockClientInstance()) } };
});
```

**Snapshot tests:** `Header.snapshot.test.js`, `SideNav.snapshot.test.js` — use `render` + `toMatchSnapshot()`

---

## banking_api_ui — Playwright (E2E)

### Framework

- **Runner:** `@playwright/test` v1.44+
- **Config:** `banking_api_ui/playwright.config.js` (browser UI tests)
- **API config:** `banking_api_ui/playwright.api.config.js` (API-only tests, no browser)

### Run Commands

```bash
cd banking_api_ui
npm run test:e2e              # all Playwright specs (starts CRA if needed)
npm run test:e2e:ci           # CI=true; retries=2, workers=1
npm run test:e2e:ci:reuse     # CI=true + skip webserver (UI already running)
npm run test:e2e:ui           # interactive Playwright UI mode
npm run test:e2e:api          # health.spec + banking-operations.spec (needs API server)
npm run test:e2e:admin        # admin-dashboard.spec.js only
npm run test:e2e:security     # security-settings.spec.js only
npm run test:e2e:agent        # banking-agent.spec.js only
npm run test:e2e:customer     # customer-dashboard.spec.js only
npm run test:e2e:landing      # landing-marketing.spec.js (unauthenticated)
npm run test:e2e:ui:smoke     # customer + landing (fast smoke)
```

**Remote/Vercel:**
```bash
CI=true PLAYWRIGHT_BASE_URL=https://banking-demo-puce.vercel.app npm run test:e2e:ci
```

### Test File Organization

```
tests/e2e/
├── admin-dashboard.spec.js
├── banking-agent.spec.js
├── banking-agent.real.spec.js
├── banking-operations.spec.js   # API-only (excluded from main config)
├── customer-dashboard.spec.js
├── health.spec.js               # API-only
├── landing-marketing.spec.js
├── security-settings.spec.js
├── session-regression.spec.js   # API-only
└── helpers/
    ├── customerDashboardMocks.js
    └── realLogin.js
```

**API-only specs** (`banking-operations.spec.js`, `health.spec.js`, `session-regression.spec.js`) are excluded from the main Playwright config and run via `playwright.api.config.js`.

### E2E Test Structure

```js
const { test, expect } = require('@playwright/test');

// Fixtures at file top
const ADMIN_USER = { id: 'admin-id', username: 'admin', role: 'admin' };

// Test pollution prevention
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.removeItem('userLoggedOut'); } catch (_) {}
  });
});

test.describe('Customer dashboard', () => {
  test('renders greeting and accounts', async ({ page }) => {
    await mockCustomerDashboard(page);
    await page.goto('/');
    await expect(page.getByText(/Hello,\s+Test/i)).toBeVisible({ timeout: 15000 });
  });
});
```

### Route Interception Pattern (Core E2E Pattern)

All API calls are intercepted — **no live server required** for UI specs:

```js
// Inline mock
await page.route('**/api/auth/oauth/status', (route) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ authenticated: true, user: ADMIN_USER }),
  })
);

// Shared helper (extracted to helpers/customerDashboardMocks.js)
async function mockCustomerDashboard(page, opts = {}) {
  const user = opts.user || DEFAULT_CUSTOMER;
  await page.route('**/api/auth/oauth/user/status', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ authenticated: true, user }) })
  );
  // stub data endpoints ...
}
```

**Helper extraction rule:** When multiple specs share the same route mock setup, extract to `tests/e2e/helpers/` (e.g. `customerDashboardMocks.js` exports `mockCustomerDashboard`, `SAMPLE_ACCOUNTS`, `SAMPLE_TRANSACTIONS`).

### Request Assertion Pattern

```js
const logoutReq = page.waitForRequest(
  (r) => r.url().includes('/api/auth/logout') && r.method() === 'GET',
  { timeout: 15000 },
);
await logoutBtn.evaluate((el) => el.click()); // native click for React handlers
await logoutReq;
```

### Overlapping Element Fix

When Playwright pointer clicks miss due to overlaying panels (e.g. BankingAgent FAB):
```js
async function dismissBankingAgentPanel(page) {
  const collapse = page.getByRole('button', { name: 'Collapse agent' });
  try { await collapse.click({ timeout: 4000 }); } catch (_) { /* already collapsed */ }
}
```
Call `dismissBankingAgentPanel(page)` before interacting with header/nav elements.

### Playwright Config Highlights

```js
module.exports = defineConfig({
  testDir: './tests/e2e',
  testIgnore: ['**/banking-operations.spec.js', '**/health.spec.js', '**/session-regression.spec.js'],
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2,
  use: {
    baseURL: UI_BASE, // default http://127.0.0.1:3000; override with PLAYWRIGHT_BASE_URL
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
});
```

---

## Coverage

| Package | Enforced threshold | Run command |
|---------|-------------------|-------------|
| `banking_api_server` | None | `npm run test:coverage` |
| `banking_mcp_server` | None | `npm run test:coverage` |
| `banking_api_ui` | None (CRA default) | `npm run test:unit -- --coverage` |

Coverage reports: `coverage/` in each package.

---

## What to Mock vs Not

**Always mock:**
- `utils/logger` — prevents test output noise
- `services/configStore` — prevents SQLite/Redis access in tests
- `axios` / `bffAxios` — prevents real HTTP calls
- Third-party OAuth providers (`pingOneAuthorizeService`, `simulatedAuthorizeService`)
- React context hooks when testing components that consume them

**Do not mock:**
- The module under test
- Pure utility functions (test them directly, as in `tests/amountValidation.test.js`)
- In-memory data store (`dataStore`) — safe in test environment

---

*Testing analysis: 2026-03-31*
