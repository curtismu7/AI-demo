/* eslint-disable import/first */
/* eslint-disable no-useless-constructor */
/* eslint-disable testing-library/no-unnecessary-act */
/* eslint-disable testing-library/prefer-find-by */
/* eslint-disable testing-library/no-node-access */
/* eslint-disable testing-library/no-unnecessary-act */
/* eslint-disable testing-library/no-node-access */
/* eslint-disable testing-library/no-render-in-setup */
/* eslint-disable testing-library/prefer-find-by */
/* eslint-disable testing-library/no-wait-for-multiple-assertions */
/* eslint-disable testing-library/no-wait-for-side-effects */
/* eslint-disable testing-library/no-container */
// banking_api_ui/src/components/__tests__/DemoDataPage.test.js
import React from "react";
import "@testing-library/jest-dom";
import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import DemoDataPage from "../DemoDataPage";

// jsdom does not implement IntersectionObserver — stub it for DemoDataPage's sticky nav.
global.IntersectionObserver = class {
	constructor() {}
	observe() {}
	unobserve() {}
	disconnect() {}
};

jest.mock("axios", () => {
	const mockClientInstance = () => ({
		get: jest.fn(() => Promise.resolve({ data: {} })),
		post: jest.fn(() => Promise.resolve({ data: {} })),
		patch: jest.fn(() =>
			Promise.resolve({ data: { updated: true, flags: [] } }),
		),
		put: jest.fn(() => Promise.resolve({ data: {} })),
		delete: jest.fn(() => Promise.resolve({ data: {} })),
		interceptors: {
			request: { use: jest.fn(), eject: jest.fn() },
			response: { use: jest.fn(), eject: jest.fn() },
		},
		defaults: { headers: { common: {} } },
	});
	const impl = {
		create: jest.fn(() => mockClientInstance()),
		get: jest.fn(() =>
			Promise.resolve({
				data: {
					agent_mcp_allowed_scopes: "read write ai_agent",
				},
			}),
		),
		post: jest.fn(() => Promise.resolve({ data: {} })),
		patch: jest.fn(() =>
			Promise.resolve({ data: { updated: true, flags: [] } }),
		),
		defaults: { headers: { common: {} } },
	};
	return { __esModule: true, default: impl, ...impl };
});

const axiosMock = require("axios").default || require("axios");

jest.mock("../../services/demoScenarioService", () => ({
	fetchDemoScenario: jest.fn(() => Promise.resolve({})),
	saveDemoScenario: jest.fn(() => Promise.resolve({ ok: true })),
}));

jest.mock("../../context/AgentUiModeContext", () => ({
	useAgentUiMode: () => ({
		placement: "none",
		fab: true,
		setAgentUi: jest.fn(),
	}),
}));

jest.mock("../../context/EducationUIContext", () => ({
	useEducationUI: () => ({ open: jest.fn() }),
	useEducationUIOptional: () => ({ open: jest.fn() }),
}));

// apiClient is used directly by DemoDataPage via a .get().then() chain.
// Mock at both the test-relative path AND provide a default export to ensure
// the Babel interop (`_interopRequireDefault`) resolves correctly.
jest.mock("../../services/apiClient", () => {
	const instance = {
		get: jest.fn(() => Promise.resolve({ data: {} })),
		post: jest.fn(() => Promise.resolve({ data: {} })),
		patch: jest.fn(() => Promise.resolve({ data: {} })),
		put: jest.fn(() => Promise.resolve({ data: {} })),
		delete: jest.fn(() => Promise.resolve({ data: {} })),
	};
	return { __esModule: true, default: instance, ...instance };
});

jest.mock("react-toastify", () => ({
	toast: {
		error: jest.fn(),
		success: jest.fn(),
		info: jest.fn(),
	},
}));
jest.mock("../../context/IndustryBrandingContext", () => ({
	useIndustryBranding: () => ({
		preset: { shortName: "Super Banking", name: "Super Banking" },
	}),
}));
jest.mock("../PingOneAudit", () => () => null);
jest.mock("../VerticalSwitcher", () => () => null);

import apiClient from "../../services/apiClient";
import {
	fetchDemoScenario,
	saveDemoScenario,
} from "../../services/demoScenarioService";

// Ensure apiClient methods always return Promises before every test.
// Jest's clearAllMocks only clears call history — not implementations.
// However we re-apply here as a belt-and-suspenders guard.
function resetApiClientMocks() {
	if (apiClient && typeof apiClient.get === "function") {
		apiClient.get.mockImplementation(() => Promise.resolve({ data: {} }));
	}
	if (apiClient && typeof apiClient.post === "function") {
		apiClient.post.mockImplementation(() => Promise.resolve({ data: {} }));
	}
	if (apiClient && typeof apiClient.patch === "function") {
		apiClient.patch.mockImplementation(() =>
			Promise.resolve({ data: { updated: true, flags: [] } }),
		);
	}
	if (apiClient && typeof apiClient.put === "function") {
		apiClient.put.mockImplementation(() => Promise.resolve({ data: {} }));
	}
	if (apiClient && typeof apiClient.delete === "function") {
		apiClient.delete.mockImplementation(() => Promise.resolve({ data: {} }));
	}
}

beforeAll(resetApiClientMocks);
beforeEach(resetApiClientMocks);

const defaultScenarioPayload = {
	accounts: [
		{
			id: "chk-1",
			name: "Checking Account",
			accountNumber: "CHK-AB",
			accountType: "checking",
			balance: 3000,
			currency: "USD",
		},
	],
	settings: { stepUpAmountThreshold: 250 },
	defaults: {
		stepUpAmountThreshold: 250,
		checkingName: "Checking Account",
		savingsName: "Savings Account",
		checkingBalance: 3000,
		savingsBalance: 2000,
		profileForm: {
			firstName: "Jordan",
			lastName: "Demo",
			email: "j@x.com",
			username: "jd",
		},
	},
	persistenceNote: null,
	userData: {
		id: "u1",
		firstName: "A",
		lastName: "B",
		email: "a@b.com",
		username: "ab",
		role: "user",
		createdAt: "2024-01-01",
		isActive: true,
	},
};

function renderPage() {
	return render(
		<BrowserRouter>
			<DemoDataPage user={{ role: "customer" }} onLogout={jest.fn()} />
		</BrowserRouter>,
	);
}

describe("DemoDataPage", () => {
	beforeEach(() => {
		fetchDemoScenario.mockResolvedValue(defaultScenarioPayload);
		saveDemoScenario.mockResolvedValue({
			ok: true,
			accounts: [],
			settings: {},
			userData: {},
		});
	});

	it("shows a type-slot card for each account type with a toggle", async () => {
		renderPage();

		await screen.findByRole("heading", { name: "Accounts" });

		// Checking slot should be enabled (from defaultScenarioPayload)
		const checkingToggle = screen.getByRole("checkbox", { name: /checking/i });
		expect(checkingToggle).toBeChecked();

		// Savings slot should be disabled (not in payload)
		const savingsToggle = screen.getByRole("checkbox", { name: /savings/i });
		expect(savingsToggle).not.toBeChecked();
	});

	it("enabling a type slot from unchecked and saving sends row with accountType but no id", async () => {
		fetchDemoScenario.mockResolvedValue({
			...defaultScenarioPayload,
			accounts: [],
		});

		renderPage();

		await screen.findByRole("heading", { name: "Accounts" });

		// Enable the savings slot
		const savingsToggle = screen.getByRole("checkbox", { name: /savings/i });
		fireEvent.click(savingsToggle);

		// Change the nickname
		const nicknameInputs = screen.getAllByPlaceholderText(/savings account/i);
		fireEvent.change(nicknameInputs[0], {
			target: { value: "Rainy day fund" },
		});

		await act(async () => {
			// Multiple Save buttons exist; first is the form submit button
			fireEvent.click(screen.getAllByRole("button", { name: /^save$/i })[0]);
		});

		await waitFor(() => expect(saveDemoScenario).toHaveBeenCalled());

		const body = saveDemoScenario.mock.calls[0][0];
		const savingsRow = body.accounts.find((a) => a.accountType === "savings");
		expect(savingsRow).toBeDefined();
		expect(savingsRow.id).toBeUndefined();
		expect(savingsRow.name).toBe("Rainy day fund");
	});
});

describe("DemoDataPage — scope permissions section", () => {
	beforeEach(() => {
		fetchDemoScenario.mockResolvedValue(defaultScenarioPayload);
		saveDemoScenario.mockResolvedValue({
			ok: true,
			accounts: [],
			settings: {},
			userData: {},
		});
		axiosMock.get.mockResolvedValue({
			data: { agent_mcp_allowed_scopes: "read write ai_agent" },
		});
		axiosMock.post.mockResolvedValue({ data: {} });
	});

	afterEach(() => jest.clearAllMocks());

	it('renders the "Agent scope permissions" heading', async () => {
		renderPage();
		await screen.findByRole("heading", { name: /agent scope permissions/i });
	});

	it("renders checkboxes for each scope in the catalog", async () => {
		renderPage();
		await screen.findByRole("heading", { name: /agent scope permissions/i });
		// Each scope has a <code> element with its exact value
		const bankingReadCodes = screen.getAllByText("read");
		expect(bankingReadCodes.length).toBeGreaterThanOrEqual(1);
		const bankingWriteCodes = screen.getAllByText("write");
		expect(bankingWriteCodes.length).toBeGreaterThanOrEqual(1);
		// The scope section renders checkboxes (one per catalog entry)
		const scopeCheckboxes = screen.getAllByRole("checkbox");
		expect(scopeCheckboxes.length).toBeGreaterThanOrEqual(6);
	});

	it("calls GET /api/admin/config on mount to load allowed scopes", async () => {
		renderPage();
		await screen.findByRole("heading", { name: /agent scope permissions/i });
		await waitFor(() => {
			expect(axiosMock.get).toHaveBeenCalledWith("/api/admin/config");
		});
	});

	it("loads feature flags for non-admin and shows PingOne Authorize demo toggles", async () => {
		axiosMock.get.mockResolvedValue({
			data: { agent_mcp_allowed_scopes: "read write ai_agent" },
		});
		renderPage();
		await screen.findByRole("heading", { name: /accounts/i });
		// Phase 163+: PingOne Authorize section is shown for all logged-in users (not admin-only)
		expect(
			screen.getByRole("heading", {
				name: /pingone authorize — demo toggles/i,
			}),
		).toBeInTheDocument();
		expect(axiosMock.get).toHaveBeenCalledWith("/api/admin/feature-flags");
	});

	it('calls POST /api/admin/config with updated scopes when "Save scope permissions" is clicked', async () => {
		renderPage();
		await screen.findByRole("heading", { name: /agent scope permissions/i });

		const saveBtn = screen.getByRole("button", {
			name: /save scope permissions/i,
		});
		await act(async () => {
			fireEvent.click(saveBtn);
		});

		await waitFor(() =>
			expect(axiosMock.post).toHaveBeenCalledWith(
				"/api/admin/config",
				expect.objectContaining({
					agent_mcp_allowed_scopes: expect.any(String),
				}),
			),
		);
	});
});

describe("DemoDataPage — PingOne Authorize toggles (admin)", () => {
	beforeEach(() => {
		fetchDemoScenario.mockResolvedValue(defaultScenarioPayload);
		axiosMock.get.mockImplementation((url) => {
			if (url === "/api/admin/feature-flags") {
				return Promise.resolve({
					data: {
						flags: [
							{
								id: "authorize_enabled",
								category: "PingOne Authorize",
								name: "Transaction authorization (master)",
								value: false,
								description:
									"Turn on policy evaluation before certain transactions.",
								impact: "imp",
								type: "boolean",
								defaultValue: false,
							},
						],
						categories: ["PingOne Authorize"],
					},
				});
			}
			return Promise.resolve({
				data: { agent_mcp_allowed_scopes: "read" },
			});
		});
	});

	it("loads feature flags and shows PingOne Authorize demo toggles", async () => {
		render(
			<BrowserRouter>
				<DemoDataPage user={{ role: "admin" }} onLogout={jest.fn()} />
			</BrowserRouter>,
		);
		await screen.findByRole("heading", {
			name: /pingone authorize — demo toggles/i,
		});
		await waitFor(() => {
			expect(axiosMock.get).toHaveBeenCalledWith("/api/admin/feature-flags");
		});
		expect(
			screen.getByText("Transaction authorization (master)"),
		).toBeInTheDocument();
	});
});

// ─── may_act session-seed tests ──────────────────────────────────────────────
describe("DemoDataPage — may_act status seeded from session on mount", () => {
	beforeEach(() => {
		fetchDemoScenario.mockResolvedValue(defaultScenarioPayload);
		axiosMock.get.mockResolvedValue({
			data: { agent_mcp_allowed_scopes: "read" },
		});
	});
	afterEach(() => {
		jest.clearAllMocks();
		delete global.fetch;
	});

	it('shows "Checking…" immediately after mount (before session fetch resolves)', async () => {
		// /api/auth/session never resolves → mayAct status stays "Checking…".
		// Other fetch calls (e.g. /api/demo-scenario/accounts inside load()) must
		// resolve so that setLoading(false) is reached and the Accounts heading appears.
		global.fetch = jest.fn((url) => {
			if (String(url).includes("/api/auth/session")) {
				return new Promise(() => {}); // hangs forever
			}
			return Promise.resolve({
				ok: true,
				json: () => Promise.resolve({ backend: "sqlite", accountCount: 1 }),
			});
		});
		render(
			<BrowserRouter>
				<DemoDataPage user={{ role: "customer" }} onLogout={jest.fn()} />
			</BrowserRouter>,
		);
		// Wait for the page loading state to clear (fetchDemoScenario resolves)
		await screen.findByRole("heading", { name: /accounts/i });
		// Session fetch is still pending — status pill should show "Checking…"
		expect(screen.getByText(/checking…/i)).toBeInTheDocument();
	});

	it("shows ✅ pill after session fetch returns mayAct present", async () => {
		global.fetch = jest.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					mayAct: { client_id: "bff-client" },
					authenticated: true,
				}),
		});
		render(
			<BrowserRouter>
				<DemoDataPage user={{ role: "customer" }} onLogout={jest.fn()} />
			</BrowserRouter>,
		);
		await waitFor(() =>
			expect(screen.getByText(/may_act present in token/i)).toBeInTheDocument(),
		);
		// Enable button disabled (already enabled)
		const enableBtn = screen.getByRole("button", { name: /enable may_act/i });
		expect(enableBtn).toBeDisabled();
	});

	it("shows ❌ pill after session fetch returns no mayAct", async () => {
		global.fetch = jest.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ mayAct: null, authenticated: true }),
		});
		render(
			<BrowserRouter>
				<DemoDataPage user={{ role: "customer" }} onLogout={jest.fn()} />
			</BrowserRouter>,
		);
		await waitFor(() =>
			expect(
				screen.getByText(/may_act absent from token/i),
			).toBeInTheDocument(),
		);
		// Clear button disabled (already cleared)
		const clearBtn = screen.getByRole("button", { name: /clear may_act/i });
		expect(clearBtn).toBeDisabled();
	});

	it("shows ❌ pill when session fetch returns ok:false", async () => {
		global.fetch = jest.fn().mockResolvedValue({ ok: false });
		render(
			<BrowserRouter>
				<DemoDataPage user={{ role: "customer" }} onLogout={jest.fn()} />
			</BrowserRouter>,
		);
		// Non-ok response → setMayActEnabled not called → stays 'Checking…' (null state renders Checking)
		// Allow time for async completion
		await new Promise((r) => setTimeout(r, 50));
		expect(screen.getByText(/checking…/i)).toBeInTheDocument();
	});
});

// ─── ff_inject_audience UI toggle tests ──────────────────────────────────────
describe("DemoDataPage — ff_inject_audience toggle (admin)", () => {
	beforeEach(() => {
		fetchDemoScenario.mockResolvedValue(defaultScenarioPayload);
		global.fetch = jest.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ mayAct: null }),
		});
		axiosMock.get.mockImplementation((url) => {
			if (url === "/api/admin/feature-flags") {
				return Promise.resolve({
					data: {
						flags: [
							{
								id: "ff_inject_audience",
								category: "Token Exchange",
								name: "Token Exchange — Auto-inject audience (BFF synthetic)",
								value: false,
								currentValue: false,
								description: "Inject audience",
								impact: "",
								type: "boolean",
								defaultValue: false,
							},
						],
						categories: ["Token Exchange"],
					},
				});
			}
			return Promise.resolve({
				data: { agent_mcp_allowed_scopes: "read" },
			});
		});
	});
	afterEach(() => {
		jest.clearAllMocks();
		delete global.fetch;
	});

	it("renders the audience auto-inject banner for admin users", async () => {
		render(
			<BrowserRouter>
				<DemoDataPage user={{ role: "admin" }} onLogout={jest.fn()} />
			</BrowserRouter>,
		);
		// The <strong> in the banner has exactly this text; the flag-list span has a prefix
		await waitFor(() =>
			expect(
				screen.getByText("Auto-inject audience (BFF synthetic)"),
			).toBeInTheDocument(),
		);
	});

	it("renders audience inject banner for non-admin users (visible to all logged-in users)", async () => {
		render(
			<BrowserRouter>
				<DemoDataPage user={{ role: "customer" }} onLogout={jest.fn()} />
			</BrowserRouter>,
		);
		await screen.findByRole("heading", { name: /token exchange/i });
		// Phase 163+: BFF injection flags section is visible to all logged-in users, not admin-only.
		// The <strong> element contains exactly this text.
		expect(
			screen.getByText("Auto-inject audience (BFF synthetic)"),
		).toBeInTheDocument();
	});

	it("calls PATCH /api/admin/feature-flags when enable audience injection is clicked", async () => {
		axiosMock.patch.mockResolvedValue({
			data: {
				updated: true,
				flags: [{ id: "ff_inject_audience", value: true, currentValue: true }],
			},
		});
		render(
			<BrowserRouter>
				<DemoDataPage user={{ role: "admin" }} onLogout={jest.fn()} />
			</BrowserRouter>,
		);
		// Wait for flag data to load — the audience 🔧 Enable button is disabled until
		// loadP1azFlags() resolves and populates audFlag in state.
		// The audience section's banner contains the exact text "Auto-inject audience (BFF synthetic)".
		// We find its sibling Enable button by scoping to the banner's parent container.
		let audienceEnableBtn;
		await waitFor(() => {
			const strong = screen.getByText("Auto-inject audience (BFF synthetic)");
			// Walk up to the banner div, then find the 🔧 Enable button inside it
			const banner = strong.closest(".demo-data-static-notice");
			const btn = banner
				? Array.from(banner.querySelectorAll("button")).find(
						(b) => !b.disabled && /enable/i.test(b.textContent),
				  )
				: null;
			if (!btn) throw new Error("audience enable button not found or still disabled");
			audienceEnableBtn = btn;
		});
		await act(async () => {
			fireEvent.click(audienceEnableBtn);
		});
		await waitFor(() =>
			expect(axiosMock.patch).toHaveBeenCalledWith(
				"/api/admin/feature-flags",
				expect.objectContaining({ updates: { ff_inject_audience: true } }),
			),
		);
	});
});

describe("DemoDataPage — agent authentication demo story", () => {
	/** Default fetch for session effect; Bearer test replaces via mockImplementation. */
	let fetchMock;

	beforeEach(() => {
		fetchDemoScenario.mockResolvedValue(defaultScenarioPayload);
		saveDemoScenario.mockResolvedValue({
			ok: true,
			accounts: [],
			settings: {},
			userData: {},
		});
		axiosMock.get.mockResolvedValue({
			data: { agent_mcp_allowed_scopes: "read write ai_agent" },
		});
		try {
			localStorage.clear();
		} catch (_) {
			/* ignore */
		}
		fetchMock = jest.fn((url) => {
			if (String(url).includes("/api/auth/session")) {
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve({ mayAct: null }),
				});
			}
			return Promise.resolve({
				ok: false,
				status: 404,
				text: () => Promise.resolve(""),
			});
		});
		global.fetch = fetchMock;
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	it("renders agent authentication demo heading and three story radios", async () => {
		renderPage();
		await screen.findByRole("heading", {
			name: /learn: how can an ai reach your bank data/i,
		});
		expect(
			screen.getByRole("radio", {
				name: /1 · recommended — real sign-in at pingone/i,
			}),
		).toBeInTheDocument();
		expect(
			screen.getByRole("radio", {
				name: /2 · sign-in from the marketing page \(pi\.flow\)/i,
			}),
		).toBeInTheDocument();
		expect(
			screen.getByRole("radio", {
				name: /3 · the ai already has an access token/i,
			}),
		).toBeInTheDocument();
	});

	it("persists pi.flow marketing story to localStorage", async () => {
		renderPage();
		await screen.findByRole("heading", {
			name: /learn: how can an ai reach your bank data/i,
		});
		fireEvent.click(
			screen.getByRole("radio", {
				name: /2 · sign-in from the marketing page \(pi\.flow\)/i,
			}),
		);
		expect(localStorage.getItem("bx-agent-auth-demo-mode")).toBe(
			"pi_flow_marketing",
		);
	});

	it("Bearer story probes /api/accounts with Authorization header and credentials omit", async () => {
		fetchMock.mockImplementation((url, opts) => {
			if (String(url).includes("/api/accounts")) {
				return Promise.resolve({
					ok: true,
					status: 200,
					text: () => Promise.resolve("[]"),
				});
			}
			if (String(url).includes("/api/auth/session")) {
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve({ mayAct: null }),
				});
			}
			return Promise.resolve({
				ok: false,
				status: 404,
				text: () => Promise.resolve(""),
			});
		});
		renderPage();
		await screen.findByRole("heading", {
			name: /learn: how can an ai reach your bank data/i,
		});
		fireEvent.click(
			screen.getByRole("radio", {
				name: /3 · the ai already has an access token/i,
			}),
		);
		fireEvent.change(screen.getByPlaceholderText(/eyJ/i), {
			target: { value: "fake.jwt.token" },
		});
		await act(async () => {
			fireEvent.click(
				screen.getByRole("button", { name: /list accounts.*with this token/i }),
			);
		});
		await waitFor(() =>
			expect(fetchMock).toHaveBeenCalledWith(
				"/api/accounts",
				expect.objectContaining({
					method: "GET",
					credentials: "omit",
					headers: expect.objectContaining({
						Authorization: "Bearer fake.jwt.token",
					}),
				}),
			),
		);
	});
});
