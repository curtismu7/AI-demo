/**
 * App.structure.test.js — merge-safety guard for App.js and route files
 *
 * Reads source files as strings and asserts critical imports and JSX
 * placements are present. Catches the class of regression where a merge
 * conflict is resolved by restoring one side of a file and silently
 * dropping additions from the other (e.g. AuthorizeRulesPanel drop in
 * merge 3d2cf092).
 *
 * These are intentionally string-level checks — fast, no DOM, no mocks.
 * If you legitimately remove one of the guarded items, update this test.
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
    ["CustomerRoutes", 'import CustomerRoutes'],
    ["AdminRoutes", 'import AdminRoutes from "./routes/AdminRoutes"'],
    ["MonitoringRoutes", 'import MonitoringRoutes'],
    ["EducationRoutes", 'import EducationRoutes'],
    ["PublicRoutes", 'import PublicRoutes'],
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

  test("CustomerRoutes rendered inside wildcard catch-all", () => {
    expect(appSrc).toContain("<CustomerRoutes user={user} logout={logout} />");
  });

  test("AdminRoutes rendered inside wildcard catch-all", () => {
    expect(appSrc).toContain("<AdminRoutes user={user} logout={logout} />");
  });

  test("MonitoringRoutes rendered for /monitoring/*", () => {
    expect(appSrc).toContain("<MonitoringRoutes");
  });

  test("EducationRoutes rendered for /architecture/*", () => {
    expect(appSrc).toContain("<EducationRoutes user={user} logout={logout} />");
  });
});

// ─── CustomerRoutes.js — highest priority (guards original regression) ────────

describe("CustomerRoutes.js — critical imports and placements", () => {
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

  test("renders AuthorizeRulesPanel after WebMcpPanel in DashboardContent", () => {
    const webIdx = src.indexOf("<WebMcpPanel />");
    const authIdx = src.indexOf("<AuthorizeRulesPanel />", webIdx);
    expect(webIdx).toBeGreaterThan(-1);
    expect(authIdx).toBeGreaterThan(webIdx);
  });

  test("no stale banking_api_ui paths", () => {
    expect(src).not.toContain("banking_api_ui");
  });
});

// ─── AdminRoutes.js ───────────────────────────────────────────────────────────

describe("AdminRoutes.js — critical imports", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../routes/AdminRoutes.js"),
    "utf8"
  );

  test('imports AdminRoute', () => {
    expect(src).toContain('import AdminRoute from "./AdminRoute"');
  });

  test('imports Dashboard', () => {
    expect(src).toContain('import Dashboard from "../components/Dashboard"');
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
