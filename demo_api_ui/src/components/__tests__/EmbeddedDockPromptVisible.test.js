/* eslint-disable testing-library/no-node-access */
// banking_api_ui/src/components/__tests__/EmbeddedDockPromptVisible.test.js
/**
 * Guard test locking REGRESSION_PLAN §1 #45/#68:
 * the agent's prompt input must stay visible when BankingAgent renders in
 * bottom-dock mode (mode="inline" + embeddedDockBottom).
 *
 * This invariant ALREADY HOLDS on current code — this test must PASS as-is.
 * It protects the input from being hidden by later dock-restyling tasks.
 *
 * The prompt input is the `<input className="ba-input">` inside
 * `<div className="ba-input-row">` (BankingAgent.js bottom input bar). It only
 * renders for a logged-in user, so we render with a real customer user prop.
 *
 * Mocks below cover ONLY the network/IO boundaries BankingAgent actually imports
 * on mount, so the component mounts without real HTTP. The vertical/branding
 * contexts tolerate a missing provider (they return defaults), so no provider
 * wrapper beyond MemoryRouter is needed.
 */
import React from "react";
import "@testing-library/jest-dom";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import BankingAgent from "../BankingAgent";

// ─── Mock network/IO boundaries that fire on mount ───────────────────────────

jest.mock("../../services/demoAgentNlService", () => ({
  fetchNlStatus: jest
    .fn()
    .mockResolvedValue({ groqConfigured: false, geminiConfigured: false }),
}));

jest.mock("../../services/configService", () => ({
  loadPublicConfig: jest.fn().mockResolvedValue({}),
}));

jest.mock("../../services/cachedStatusService", () => ({
  getCachedStatus: jest.fn().mockResolvedValue({}),
}));

jest.mock("../../services/bffAxios", () => ({
  __esModule: true,
  default: {
    get: jest.fn().mockResolvedValue({ data: {} }),
    post: jest.fn().mockResolvedValue({ data: {} }),
  },
}));

jest.mock("../../services/appEventClient", () => ({
  postAppEvent: jest.fn().mockResolvedValue({}),
}));

// CSS import is a no-op in tests
jest.mock("../BankingAgent.css", () => ({}), { virtual: true });

// ─── Fixtures ────────────────────────────────────────────────────────────────

const customerUser = {
  id: "u1",
  role: "customer",
  email: "user@test.com",
  username: "bankUser",
  firstName: "Test",
  lastName: "User",
};

beforeEach(() => {
  localStorage.clear();
});

function renderAgent(props = {}) {
  return render(
    <MemoryRouter>
      <BankingAgent {...props} />
    </MemoryRouter>,
  );
}

// ─── Invariant: prompt input visible in bottom-dock mode ─────────────────────

describe("Bottom-dock prompt input visibility (§1 #45/#68)", () => {
  it("renders the .ba-input prompt field inside .ba-input-row in bottom-dock mode", () => {
    renderAgent({
      user: customerUser,
      mode: "inline",
      embeddedDockBottom: true,
    });

    const input = document.querySelector(".ba-input-row .ba-input");
    expect(input).not.toBeNull();
  });
});
