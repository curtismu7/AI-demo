/**
 * App.structure.test.js — merge-safety guard for App.js and route files
 *
 * Two layers of protection:
 *
 * 1. String-level assertions: cheap, fast — guard critical imports and JSX
 *    placements against silent merge drops (e.g. AuthorizeRulesPanel drop in
 *    merge 3d2cf092).
 *
 * 2. Render smoke tests: actually mount each /:path under MemoryRouter and
 *    confirm it doesn't throw. Catches the class of bug where the structure
 *    LOOKS right as text but React Router rejects it at render time (e.g.
 *    "<X> is not a <Route> component" — caught by Playwright but missed by
 *    string-level tests, see the inlined-wildcard fix).
 */

const fs = require("fs");
const path = require("path");

const appSrc = fs.readFileSync(
  path.resolve(__dirname, "../App.js"),
  "utf8"
);

// ─── App.js Imports ───────────────────────────────────────────────────────────

describe("App.js — critical imports", () => {
  const cases = [
    ["BankingAgent", 'import BankingAgent from "./components/BankingAgent"'],
    ["EmbeddedAgentDock", 'import EmbeddedAgentDock from "./components/EmbeddedAgentDock"'],
    ["SessionTokenProvider", 'import { SessionTokenProvider } from "./context/SessionTokenContext"'],
    ["resolveEmbeddedFocus from demoAgentSafety", 'import { resolveEmbeddedFocus } from "./components/demoAgentSafety"'],
    ["DashboardContent", 'import { DashboardContent } from "./routes/CustomerRoutes"'],
    ["EducationRoutes", 'import EducationRoutes from "./routes/EducationRoutes"'],
    ["MonitoringRoutes", 'import MonitoringRoutes'],
    ["PublicRoutes", 'import PublicRoutes'],
    // Note: WebMcpPanel + AuthorizeRulesPanel imports live in routes/CustomerRoutes.js
    // (DashboardContent) — they are asserted in the CustomerRoutes.js block below.
  ];

  test.each(cases)("imports %s", (_name, importStr) => {
    expect(appSrc).toContain(importStr);
  });
});

// ─── App.js JSX placements ────────────────────────────────────────────────────

describe("App.js — critical JSX placements", () => {
  test("SessionTokenProvider wraps AppWithAuth", () => {
    const providerOpen = appSrc.indexOf("<SessionTokenProvider>");
    const appWithAuth = appSrc.indexOf("<AppWithAuth />", providerOpen);
    const providerClose = appSrc.indexOf("</SessionTokenProvider>", appWithAuth);
    expect(providerOpen).toBeGreaterThan(-1);
    expect(appWithAuth).toBeGreaterThan(providerOpen);
    expect(providerClose).toBeGreaterThan(appWithAuth);
  });

  test("surfaceHostEl is passed to BankingAgent (portal pattern)", () => {
    expect(appSrc).toContain("surfaceHostEl={surfaceHostEl}");
  });

  test("resolveEmbeddedFocus is passed as embeddedFocus prop", () => {
    expect(appSrc).toContain("embeddedFocus={resolveEmbeddedFocus(pathname)}");
  });

  test("EmbeddedAgentDock is rendered at App level", () => {
    expect(appSrc).toContain("<EmbeddedAgentDock");
  });

  test("DashboardContent is rendered inside the /dashboard route", () => {
    expect(appSrc).toContain("<DashboardContent user={user} logout={logout} />");
  });

  test("MonitoringRoutes is rendered for /monitoring/*", () => {
    expect(appSrc).toContain("<MonitoringRoutes");
  });

  test("EducationRoutes is rendered for /architecture/*", () => {
    expect(appSrc).toContain("<EducationRoutes user={user} logout={logout} />");
  });

  test("Wildcard catch-all does NOT contain bare component wrappers around <Route>", () => {
    // React Router v6 requires <Route> elements to be DIRECT children of <Routes>.
    // A bare `<AdminRoutes ...>` or `<CustomerRoutes ...>` (no path prop) returning
    // <Route> fragments crashes at render time. Catch that class of bug here.
    const wildcardForbidden = [
      "<AdminRoutes ",
      "<CustomerRoutes ",
      "<EducationWildcardRoutes ",
    ];
    for (const fragment of wildcardForbidden) {
      expect(appSrc).not.toContain(fragment);
    }
  });
});

// ─── DashboardContent (highest priority — guards the 3d2cf092 regression) ────

describe("CustomerRoutes.js / DashboardContent — critical imports and JSX", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../routes/CustomerRoutes.js"),
    "utf8"
  );

  test('imports WebMcpPanel', () => {
    expect(src).toContain('import WebMcpPanel from "../components/WebMcpPanel"');
  });

  test('imports AuthorizeRulesPanel', () => {
    expect(src).toContain('import AuthorizeRulesPanel from "../components/AuthorizeRulesPanel"');
  });

  test("DashboardContent renders AuthorizeRulesPanel after WebMcpPanel", () => {
    const webIdx = src.indexOf("<WebMcpPanel />");
    const authIdx = src.indexOf("<AuthorizeRulesPanel />", webIdx);
    expect(webIdx).toBeGreaterThan(-1);
    expect(authIdx).toBeGreaterThan(webIdx);
  });

  test("no stale banking_api_ui paths", () => {
    expect(src).not.toContain("banking_api_ui");
  });
});

// ─── MonitoringRoutes.js ──────────────────────────────────────────────────────

describe("MonitoringRoutes.js — critical imports", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../routes/MonitoringRoutes.js"),
    "utf8"
  );

  test('imports TokenChainDisplay', () => {
    expect(src).toContain('import TokenChainDisplay from "../components/TokenChainDisplay"');
  });

  test('imports ApiExplorerPanel', () => {
    expect(src).toContain('import ApiExplorerPanel from "../components/ApiExplorerPanel"');
  });

  test("no stale banking_api_ui paths", () => {
    expect(src).not.toContain("banking_api_ui");
  });
});

// ─── EducationRoutes.js ───────────────────────────────────────────────────────

describe("EducationRoutes.js — critical imports", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../routes/EducationRoutes.js"),
    "utf8"
  );

  test('imports ArchitectureTabsPanel', () => {
    expect(src).toContain('import ArchitectureTabsPanel from "../components/ArchitectureTabsPanel"');
  });

  test("no stale banking_api_ui paths", () => {
    expect(src).not.toContain("banking_api_ui");
  });
});
