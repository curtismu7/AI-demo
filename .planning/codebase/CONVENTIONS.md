# Conventions — BX Finance Banking Demo

*Last updated: April 2026 (Phase 140)*

---

## Language & Modules

### Server (`banking_api_server/`)
- **Runtime**: Node.js 20.x
- **Module system**: CommonJS (`require` / `module.exports`)
- **Style**: Mostly vanilla JS; no TypeScript compilation step
- **Linting**: ESLint (`.eslintrc.js`); uses `no-console` warn for non-logger console calls

### Frontend (`banking_api_ui/`)
- **Bundler**: CRA 5 (react-scripts webpack)
- **Module system**: ES Modules (`import` / `export default`)
- **Primary language**: JavaScript JSX (`.js`, `.jsx`)
- **Mixed TS**: 4+ `.tsx` files (`ActorTokenEducation.tsx`, `TokenInspector.tsx`, `ConfigTokenValidation.tsx`, `UnifiedConfigurationPage.tsx`) — compiled by CRA; no separate tsconfig enforced
- **React version**: 18 with functional components + hooks exclusively; no class components

### MCP Server (`banking_mcp_server/`)
- **Language**: TypeScript strict, compiled to `dist/`
- **Module system**: ESM output (`"type": "module"` in `package.json`)

---

## React Patterns

### Component structure
```jsx
// Functional component with hooks only; no class components
const MyComponent = ({ prop1, prop2 }) => {
  const [state, setState] = useState(initialValue);
  const toast = useToast();    // or use appToast directly

  useEffect(() => { /* side effects */ }, [dependency]);

  return <div className="my-component">...</div>;
};

export default MyComponent;
```

### Global state
- **React Context** — no Redux, no Zustand
- Contexts live in `src/context/`; consumed via `useContext(ContextName)`
- Key contexts:
  - `VerticalContext` — industry branding (Chase vs generic)
  - `ThemeContext` — dark/light mode
  - `AgentUiModeContext` — agent panel open/close state
  - `TokenChainContext` — token chain visualization

### API calls
All frontend HTTP calls go through the **axios singleton**:
```js
import apiClient from '../services/apiClient';

// Always withCredentials (sends session cookie)
const response = await apiClient.get('/api/endpoint');
const response = await apiClient.post('/api/endpoint', body);
```

`apiClient` applies:
1. `SpinnerService` interceptor — global loading spinner
2. `apiTrafficStore` interceptor — records for `/api-traffic` panel

### Notifications
```js
import { notifySuccess, notifyError, notifyInfo } from '../utils/appToast';

notifySuccess('Action completed');
notifyError('Something failed: ' + err.message);
notifyInfo('Note: ...');
```

Never use `toast()` directly; always use the `appToast.js` wrappers.

---

## BFF (Express) Patterns

### Route handler shape
```js
router.post('/action', authenticateToken, async (req, res) => {
  const sessionId = req.query.sessionId || 'default';
  try {
    const result = await someService.doSomething(params);
    await trackApiCall(sessionId, 'POST /action', requestData, result, 200);
    res.json(result);
  } catch (err) {
    logger.error('Action failed', { error: err.message });
    await trackApiCall(sessionId, 'POST /action', requestData, { error: err.message }, 500);
    res.status(500).json({ success: false, error: err.message });
  }
});
```

### Service shape
```js
// services/someService.js
const { logger } = require('../utils/logger');

async function doSomething(params) {
  // business logic
  return result;  // throws on failure
}

module.exports = { doSomething };
```

### Session pattern
```js
// Session attached by express-session middleware
req.session.userId        // current user sub
req.session.adminToken    // admin access token (opaque)
req.session.userTokens    // { access_token, id_token, refresh_token } for user
req.session.adminLoggedIn // boolean
req.session.userLoggedIn  // boolean
```

### `sessionId` pattern
Callers pass `?sessionId=<tab-uuid>` as a query param. Routes bucket API call logs by this session ID. Default: `'pingone-test'` or `'default'`.

### Error response format
```json
{ "success": false, "error": "Human-readable message" }
```
Errors always return JSON — never plain text.

### Successful response format
Returns raw data object from service (not always wrapped in `{ success: true }`). Callers check HTTP status code.

---

## Logging

```js
const { logger } = require('../utils/logger');

logger.info('Message', { key: value });
logger.error('Failed', { error: err.message, stack: err.stack });
logger.debug('Detail', { data });       // suppressed in prod
```

Never use `console.log` in production code paths — use `logger`.

---

## CSS Conventions

- **Scoping**: Per-component `.css` file colocated with the component
- **Naming**: BEM-lite kebab-case (`.my-component`, `.my-component__child`, `.my-component--modifier`)
- **CSS Modules**: Only for `.tsx` components (4+ files) — use `styles.className`
- **Global**: `src/styles/global.css` (Chase palette, CSS variables, card base styles)
- **Dark mode**: CSS custom properties toggled via `data-theme="dark"` on `<body>`

---

## OAuth / Token Conventions

- **Tokens server-side only**: Access + refresh tokens are stored in `req.session`, never sent to frontend
- **Frontend identity**: Read from `/api/auth/status` which returns safe user claims
- **PKCE state**: Stored in `pkce_state` cookie via `pkceStateCookie.js`
- **Auth cookie**: `_auth` cookie (httpOnly, SameSite=None, Secure) used for Vercel cross-instance session restore
- **Token exchange**: All on-behalf-of exchanges happen server-side in `oauthUserService.js`
- **Scopes**: Defined centrally in `config/oauthUser.js`; never hardcoded in routes

---

## Authentication Middleware

```js
const { authenticateToken } = require('../middleware/auth');

// Requires valid session with userTokens or _cookie_session stub
router.get('/protected', authenticateToken, handler);
```

`authenticateToken` sets `req.user = { sub, email, ... }` claims from the access token or session.

---

## MCP Server (TypeScript)

- Interfaces for all tool inputs/outputs (`src/types/`)
- `BankingToolRegistry` — maps tool names to `BankingToolProvider` instances
- Tools return `{ content: [{ type: 'text', text: JSON.stringify(result) }] }`
- Auth challenge pattern: Tools throw `AuthChallenge` which `MCPMessageHandler` converts to `mcp.auth.challenge`
- Session keyed on WebSocket connection ID in `BankingSessionManager`

---

## Testing Conventions

See `TESTING.md` for full detail.

- **Server**: Jest, CommonJS, `jest.mock(...)` for deps
- **Frontend**: `@testing-library/react`, `jest-dom` matchers
- **File location**: `src/__tests__/` for server unit; `tests/e2e/` for Playwright E2E
- **Coverage target**: `collectCoverageFrom: ['src/**/*.js']` (server only)
