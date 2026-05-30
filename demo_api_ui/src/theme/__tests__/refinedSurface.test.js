/* eslint-disable import/first -- jest.mock must precede imports */

// Polyfill window.scrollTo for jsdom (UserDashboard handlers reference it)
if (typeof window !== "undefined" && !window.scrollTo) {
  window.scrollTo = jest.fn();
}

// fetch is used by mount effects (feature-flags, session-preview) — stub it
global.fetch = jest.fn(() =>
  Promise.resolve({ ok: false, json: () => Promise.resolve({}) }),
);

// ── Contexts the component consumes ──────────────────────────────────────────
jest.mock("../../context/AgentUiModeContext", () => ({
  useAgentUiMode: () => ({
    placement: "none",
    setSurfaceHostEl: jest.fn(),
  }),
}));
jest.mock("../../context/EducationUIContext", () => ({
  useEducationUI: () => ({ open: jest.fn() }),
}));
jest.mock("../../context/SessionTokenContext", () => ({
  useSessionToken: () => ({ publishTokenState: jest.fn() }),
}));
jest.mock("../../hooks/useCurrentUserTokenEvent", () => ({
  useCurrentUserTokenEvent: () => {},
}));

// ── Vertical manifest ────────────────────────────────────────────────────────
jest.mock("../../vertical/useVertical", () => ({
  useVertical: () => ({
    pageManifest: {
      dashboard: { kind: "banking" },
      terminology: { agent: "Banking Agent" },
      identity: { displayName: "Super Banking" },
    },
    pageMockData: { heroStats: {} },
    agentManifest: { agent: {} },
    isAdminScope: false,
  }),
}));

// ── Router ───────────────────────────────────────────────────────────────────
jest.mock("react-router-dom", () => {
  const r = require("react");
  return {
    Link: ({ children, to, ...rest }) =>
      r.createElement(
        "a",
        { href: typeof to === "string" ? to : "", ...rest },
        children,
      ),
    useNavigate: () => jest.fn(),
    useLocation: () => ({ pathname: "/dashboard", search: "", state: null }),
  };
});

// ── Network clients return empty so the demo-fallback path resolves quickly ──
jest.mock("../../services/apiClient", () => ({
  __esModule: true,
  default: {
    get: jest.fn(() => Promise.resolve({ data: {} })),
    post: jest.fn(() => Promise.resolve({ data: {} })),
    put: jest.fn(() => Promise.resolve({ data: {} })),
  },
}));
jest.mock("axios", () => ({
  __esModule: true,
  default: {
    get: jest.fn(() => Promise.resolve({ data: {} })),
    post: jest.fn(() => Promise.resolve({ data: {} })),
    put: jest.fn(() => Promise.resolve({ data: {} })),
  },
}));
jest.mock("../../services/cachedStatusService", () => ({
  __esModule: true,
  getCachedJson: jest.fn(() =>
    Promise.resolve({ data: { authenticated: false } }),
  ),
}));

// ── Heavy child components stubbed to keep the render in jsdom ────────────────
jest.mock("../../components/TokenChainDisplay", () => () => null);
jest.mock("../../components/ExchangeModeToggle", () => () => null);
jest.mock("../../components/Fido2Challenge", () => () => null);
jest.mock("../../components/ConfirmModal", () => () => null);
jest.mock("../../components/TransactionConsentModal", () => () => null);
jest.mock("../../components/EmbeddedAgentDock", () => () => null);
jest.mock("../../components/FloatingPanel", () => ({ children }) => children);
jest.mock("../../components/OAuthTokenDisplayPage", () => () => null);
jest.mock("../../components/RetailDashboard", () => () => null);
jest.mock("../../components/agent-clinical/AgentClinicalHost", () => () => null);

jest.mock("react-toastify", () => ({
  toast: {
    dismiss: jest.fn(),
    isActive: jest.fn(() => false),
    update: jest.fn(),
    warning: jest.fn(),
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

import React from "react";
import { render, waitFor } from "@testing-library/react";
import UserDashboard from "../../components/UserDashboard";

test("customer dashboard renders a refined surface container", async () => {
  const { container } = await waitFor(() => render(<UserDashboard user={{ name: "Demo" }} />));
  await waitFor(() =>
    expect(
      container.querySelector('[data-refined-surface="customer"]'),
    ).not.toBeNull(),
  );
});
