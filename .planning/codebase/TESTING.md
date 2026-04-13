# Testing — BX Finance Banking Demo

*Last updated: April 2026 (Phase 140)*

---

## Overview

| Layer | Framework | Count |
|-------|-----------|-------|
| BFF unit/integration | Jest (Node) | ~80 test files |
| BFF API integration | Jest + Supertest | included above |
| Frontend unit | Jest + React Testing Library | in `banking_api_ui/src/__tests__/` |
| E2E | Playwright | `banking_api_ui/tests/e2e/` + `tests/integration/` |

---

## Server Tests

### Jest configuration
```js
// banking_api_server/jest.config.js
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/src/__tests__/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.js'],
  collectCoverageFrom: ['src/**/*.js', '!src/__tests__/**'],
  coverageThreshold: { global: { lines: 60 } },
  // CI only:
  maxWorkers: 2,   // prevents supertest/socket flakiness
};
```

### Test file locations
```
banking_api_server/
├── __tests__/
│   └── tokenIntrospection.test.js   # (1 top-level file)
└── src/
    └── __tests__/                   # ~79 files — main suite
        ├── setup.js                 # Global mocks (express-session, redis, etc.)
        ├── actClaimValidator.test.js
        ├── bffSessionGating.test.js
        ├── delegationChainValidationService.test.js
        ├── oauth-error-handling.test.js
        ├── oauth-redirect-uri.test.js
        ├── scope-integration.test.js
        ├── tokenExchange.test.js
        ├── upstashSessionStore.test.js
        ├── bankingAgentLangChainServiceIntegration.test.js
        └── ...
```

Additional test files under `banking_api_server/tests/`:
```
tests/
├── integration/
│   └── serverRoutes.integration.test.js
└── ...
```

### Mock pattern
```js
// Standard logger mock — used in nearly every test file
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
  debugLog: jest.fn(),
}));

// Service mock
jest.mock('../../services/configStore', () => ({
  getEffective: jest.fn().mockResolvedValue({ pingoneEnvId: 'test-env' }),
}));
```

### Key test suites

| File | Tests |
|------|-------|
| `actClaimValidator.test.js` | RFC 8693 `act` claim validation rules |
| `bffSessionGating.test.js` | Blocks `_cookie_session` stub from sensitive endpoints |
| `delegationChainValidationService.test.js` | RFC 8693 delegation chain depth + circular check |
| `oauth-error-handling.test.js` | PKCE error callback edge cases |
| `oauth-redirect-uri.test.js` | Redirect URI derivation (prod vs local vs Vercel) |
| `scope-integration.test.js` | Scope enforcement for token exchange |
| `upstashSessionStore.test.js` | Upstash session store create / read / destroy |
| `tokenIntrospection.test.js` | RFC 7662 introspection responses |
| `bankingAgentLangChainServiceIntegration.test.js` | Agent end-to-end with LangGraph |

### npm test scripts
```json
{
  "test": "jest",
  "test:unit": "jest src/__tests__/unit",
  "test:auth": "jest --testPathPattern=oauth",
  "test:session": "jest --testPathPattern=session",
  "test:bff-tokens": "jest --testPathPattern=token"
}
```

---

## Frontend Tests

### Setup
```json
// banking_api_ui/package.json (test scripts via react-scripts)
"test": "react-scripts test"
```

### Test file locations
```
banking_api_ui/
└── src/
    ├── __tests__/
    │   └── *.test.js        # Integration / hook tests
    └── components/
        └── __tests__/
            └── *.test.jsx   # Component render tests
```

### Patterns
```jsx
// @testing-library/react
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

test('shows balance', () => {
  render(<AccountCard balance={100} />);
  expect(screen.getByText('$100')).toBeInTheDocument();
});
```

---

## E2E Tests

### Playwright setup
```
banking_api_ui/
└── tests/
    ├── e2e/
    │   ├── playwright.config.js
    │   ├── auth.spec.js        # Login / logout flow
    │   ├── dashboard.spec.js   # Admin dashboard
    │   └── ...
    └── integration/
        └── *.spec.js
```

```bash
# Run E2E (requires running server + ui)
npx playwright test
npx playwright test --headed  # visible browser
```

---

## Running Tests

```bash
# All server tests
cd banking_api_server && npm test

# With coverage
cd banking_api_server && npm test -- --coverage

# Specific test file
cd banking_api_server && npm test -- --testPathPattern=actClaimValidator

# Frontend tests (watch)
cd banking_api_ui && npm test

# E2E
cd banking_api_ui && npx playwright test
```

---

## CI Notes

- `maxWorkers: 2` in Jest config to prevent socket test flakiness in GitHub Actions
- E2E tests require live BFF + PingOne tenant — skipped in CI by default
- `PINGONE_ENV_ID` and friends must be set for auth integration tests
