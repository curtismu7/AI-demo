import React, {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useEducationUIOptional } from "../context/EducationUIContext";
import { useIndustryBranding } from "../context/IndustryBrandingContext";
import { useTheme } from "../context/ThemeContext";
import { useTokenChainOptional } from "../context/TokenChainContext";
import {
	AGENT_CONSENT_BLOCK_USER_MESSAGE,
	isAgentBlockedByConsentDecline,
	setAgentBlockedByConsentDecline,
} from "../services/agentAccessConsent";
import { agentFlowDiagram } from "../services/agentFlowDiagramService";
import { appendTokenEvents } from "../services/apiTrafficStore";
import { fetchNlStatus } from "../services/bankingAgentNlService";
import {
	callMcpTool,
	createDeposit,
	createTransfer,
	createWithdrawal,
	getAccountBalance,
	getMyAccounts,
	getMyTransactions,
	refreshOAuthSession,
	sendAgentMessage,
} from "../services/bankingAgentService";
import bffAxios from "../services/bffAxios";
import { getCachedStatus } from "../services/cachedStatusService";
import { loadPublicConfig } from "../services/configService";
import { spinner } from "../services/spinnerService";
import { getToolStepsForAction } from "../utils/agentToolSteps";
import {
	notifyError,
	notifyInfo,
	notifySuccess,
	toast,
} from "../utils/appToast";
import { isBankingAgentFloatingDefaultOpen } from "../utils/bankingAgentFloatingDefaultOpen";
import { isPublicMarketingAgentPath } from "../utils/embeddedAgentFabVisibility";
import AccountDetailsPanel from "./AccountDetailsPanel";
import AgentConsentModal from "./AgentConsentModal";
import { EDUCATION_COMMANDS } from "./education/educationCommands";
import { EDU } from "./education/educationIds";
import FidoStepUpModal from "./FidoStepUpModal";
import MCPToolsListModal from "./MCPToolsListModal";
import OtpStepUpModal from "./OtpStepUpModal";
import TokenChainDisplay from "./TokenChainDisplay";
import TransactionConsentModal from "./TransactionConsentModal";
import "./BankingAgent.css";
import { postAppEvent } from '../services/appEventClient';

/** NL message to replay after customer OAuth redirect from marketing agent (sessionStorage). */
const BX_AGENT_PENDING_NL_KEY = "bx_agent_pending_nl";

/** Session expiry countdown timer component */
function SessionExpiryTimer({ sessionInfo, className = "" }) {
	const [timeRemaining, setTimeRemaining] = useState(null);
	const [isExpiringSoon, setIsExpiringSoon] = useState(false);

	useEffect(() => {
		if (!sessionInfo?.expiresAt) return;

		const calculateTimeRemaining = () => {
			const now = Date.now();
			const expiresAt = new Date(sessionInfo.expiresAt).getTime();
			const remaining = Math.max(0, expiresAt - now);

			setTimeRemaining(remaining);
			setIsExpiringSoon(remaining > 0 && remaining < 5 * 60 * 1000); // Less than 5 minutes
		};

		calculateTimeRemaining();
		const interval = setInterval(calculateTimeRemaining, 1000);

		return () => clearInterval(interval);
	}, [sessionInfo?.expiresAt]);

	if (!timeRemaining || timeRemaining <= 0) return null;

	const formatTime = (ms) => {
		const minutes = Math.floor(ms / 60000);
		const seconds = Math.floor((ms % 60000) / 1000);
		return `${minutes}:${seconds.toString().padStart(2, "0")}`;
	};

	return (
		<div
			className={`ba-session-timer ${isExpiringSoon ? "ba-session-timer--expiring" : ""} ${className}`}
			title={`Session expires in ${formatTime(timeRemaining)}`}
		>
			<span className="ba-session-timer-icon">{"\u23f0"}</span>
			<span className="ba-session-timer-text">{formatTime(timeRemaining)}</span>
		</div>
	);
}

// ─── Action definitions ────────────────────────────────────────────────────────

const ACTION_GROUPS = {
	account: [
		{ id: "accounts", label: "🏦 My Accounts", desc: "List all your accounts" },
		{
			id: "balance",
			label: "💰 Check Balance",
			desc: "Balance for an account",
		},
		{
			id: "sensitive-account-details",
			label: "👁 View Sensitive Account Details",
			desc: "View full account number and routing number (requires consent)",
		},
	],
	transaction: [
		{
			id: "transactions",
			label: "📋 Recent Transactions",
			desc: "View recent activity",
		},
		{ id: "deposit", label: "⬇ Deposit", desc: "Deposit into an account" },
		{ id: "withdraw", label: "⬆ Withdraw", desc: "Withdraw from an account" },
		{ id: "transfer", label: "↔ Transfer", desc: "Transfer between accounts" },
	],
	admin: [
		{
			id: "mcp_tools",
			label: "🔧 MCP Tools",
			desc: "List all available MCP banking tools",
		},
		{ id: "logout", label: "🚪 Log Out", desc: "Sign out of your account" },
	],
	testing: [
		{
			id: "test_wrong_scope",
			label: "⚠️ Test Wrong Scope",
			desc: "Send request with unauthorized scope (auth rejection)",
		},
		{
			id: "test_wrong_audience",
			label: "⚠️ Test Wrong Audience",
			desc: "Send request with wrong audience (auth rejection)",
		},
		{
			id: "test_hitl_required",
			label: "🔐 Test HITL Transfer",
			desc: "Attempt high-value transfer (requires consent)",
		},
		{
			id: "test_otp_required",
			label: "📱 Test OTP Challenge",
			desc: "Trigger OTP/MFA step-up authentication",
		},
	],
};

// Backwards compatibility: flat ACTIONS array from ACTION_GROUPS
const ACTIONS = Object.values(ACTION_GROUPS).flat();

// ─── Fake account data generator ────────────────────────────────────────────────

function generateFakeAccounts(_user) {
	// Use plain type names ('checking', 'savings') as IDs — NOT chk-/sav-prefixed fake IDs.
	// The server's resolveAccountId resolves 'checking' → real checking account by type,
	// so submissions while liveAccounts are still loading will succeed instead of returning
	// '❌ Account chk-5 not found' (stale fake IDs bypass type-resolution on the server).
	return [
		{
			id: "checking",
			name: "Checking Account",
			type: "checking",
			balance: 0,
			accountNumber: "CHECKING",
		},
		{
			id: "savings",
			name: "Savings Account",
			type: "savings",
			balance: 0,
			accountNumber: "SAVINGS",
		},
	];
}

// ─── Suggested prompts — role-aware ──────────────────────────────────────────

const SUGGESTIONS_CUSTOMER = [
	"Show me my accounts",
	"Show me my full account details",
	"Transfer $100 from checking to savings",
	"Deposit $50 into checking",
];

const SUGGESTIONS_ADMIN = [
	"Show all customer accounts",
	"Show me last 5 errors",
	"What is step-up auth?",
];

const SUGGESTIONS_CONFIG_CUSTOMER = [
	"How do I change industry branding (e.g. FunnyBank) on the config page?",
	"How do Agent MCP scopes limit transfers vs read-only?",
	"What PingOne or OAuth environment variables does this app need?",
	"How should I set redirect URIs for local development?",
	"What OAuth scopes does the BFF use?",
	"What is PKCE and why does this app use it?",
	"List MCP tools",
	"How do I fix invalid_redirect_uri?",
];

const SUGGESTIONS_CONFIG_ADMIN = [
	"How do I add a new industry preset (colors, logo) to this demo?",
	"What is agent_mcp_allowed_scopes and how does token exchange use it?",
	"What worker app credentials does the API server need in production?",
	"What redirect URIs should I register in PingOne for this demo?",
	"Show me last 5 errors",
	"List MCP tools",
	"How does token exchange work for the MCP server?",
	"What is CIBA?",
];

/**
 * Chat copy when the BFF has a cookie but no live OAuth tokens.
 * Adapts to store quota/auth errors vs. healthy Redis but missing OAuth tokens in this session.
 */
function buildSessionNotHydratedChat(storeError, sessionStoreHealthy = null) {
	const isQuota =
		storeError && storeError.includes("max requests limit exceeded");
	const isMissingAuth =
		storeError &&
		(storeError.includes("WRONGPASS") || storeError.includes("unauthorized"));

	let secondLine;
	if (isQuota) {
		secondLine =
			"The Upstash Redis daily request quota is exhausted — the session store cannot save or load tokens until the quota resets.";
	} else if (isMissingAuth) {
		secondLine =
			"The session store rejected credentials (WRONGPASS or unauthorized).";
	} else if (storeError) {
		secondLine = `The session store reported an error: ${storeError}`;
	} else if (sessionStoreHealthy === true) {
		secondLine =
			"The session store is healthy, but this browser session does not have OAuth access tokens. The server rebuilt your identity from the signed _auth cookie (sessionRestored / accessTokenStub in session debug).";
	} else {
		secondLine =
			'This session has no OAuth tokens (cookie-only or failed save after login). It is not the same as "Redis is down".';
	}

	const lines = [
		"Your browser shows you as signed in, but the Banking Agent needs OAuth tokens on the server for MCP and NL.",
		secondLine,
		"",
		'Diagnose: use "Open session debug" (uses ?deep=1) — compares Redis row vs req.session; sessionStoreHealthy can be true while accessTokenStub is true.',
		"",
	];

	if (isQuota) {
		lines.push(
			"Fix options:",
			"  1. Wait — Upstash free-tier quota resets at midnight UTC automatically.",
			"  2. Upgrade — go to console.upstash.com and upgrade the database to Pay-As-You-Go.",
			"  3. Recreate — create a new Upstash database and update KV_REST_API_URL + KV_REST_API_TOKEN in Vercel.",
			"",
			"After the quota resets or the database is replaced, sign out and sign in again.",
		);
	} else if (isMissingAuth) {
		lines.push(
			"Fix: In Vercel → Settings → Environment Variables, confirm these are set and correct:",
			"  • KV_REST_API_URL",
			"  • KV_REST_API_TOKEN",
			"Apply to Production, redeploy, sign out, sign in again.",
		);
	} else if (storeError) {
		lines.push(
			"Fix: sign out and sign in again after the store error is resolved. Check Vercel logs for session-store or OAuth callback errors.",
		);
	} else {
		lines.push(
			"Fix:",
			"  1. Sign out completely, then sign in again with PingOne (writes fresh tokens into the server session).",
			'  2. If it still happens right after login, check Vercel logs for "[oauth/user/callback] Session save FAILED".',
		);
	}

	lines.push(
		"",
		sessionStoreHealthy === true
			? '"Refresh access token" only helps if the server already holds a refresh token. With a stub token, use Sign out and sign in again.'
			: 'After a fresh login you want sessionStoreType: "upstash-rest" and sessionStoreHealthy: true. "Refresh access token" cannot fix a missing session store.',
	);

	return lines.join("\n");
}

/** Fallback when session response is not available (no healthy flag). */
const SESSION_NOT_HYDRATED_CHAT = buildSessionNotHydratedChat(null, null);

/**
 * Picks the signed-in user from Backend-for-Frontend (BFF) status responses and reads cookie-only / Vercel hydration flag from GET /api/auth/session.
 */
function resolveSessionFromAuthTrio(admin, endUser, session) {
	const found =
		admin?.authenticated && admin.user
			? admin.user
			: endUser?.authenticated && endUser.user
				? endUser.user
				: session?.authenticated && session.user
					? session.user
					: null;
	return { found, cookieOnlyBffSession: !!session?.cookieOnlyBffSession };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(n) {
	return typeof n === "number"
		? `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
		: n;
}

/** Unwrap MCP `tools/call` shape `{ content: [{ text: "<json>" }] }` for display logic. */
function normalizeAgentToolResult(result) {
	if (!result) return result;
	if (
		result.content &&
		Array.isArray(result.content) &&
		result.content[0]?.text
	) {
		try {
			return JSON.parse(result.content[0].text);
		} catch {
			return result;
		}
	}

	return result;
}

/**
 * Build the payload expected by POST /api/transactions/consent-challenge
 * from the agent actionId + form values (same keys used in runAction).
 */
function buildConsentIntent(actionId, form) {
	const amount = parseFloat(form.amount);
	if (actionId === "deposit") {
		return {
			type: "deposit",
			toAccountId: form.accountId || form.toId,
			fromAccountId: null,
			amount,
			description: form.note || "Agent deposit",
		};
	}
	if (actionId === "withdraw") {
		return {
			type: "withdrawal",
			fromAccountId: form.accountId || form.fromId,
			toAccountId: null,
			amount,
			description: form.note || "Agent withdrawal",
		};
	}
	if (actionId === "transfer") {
		return {
			type: "transfer",
			fromAccountId: form.fromId,
			toAccountId: form.toId,
			amount,
			description: form.note || "Agent transfer",
		};
	}
	return null;
}

/** Maps MCP JSON (including deposit/transfer/withdraw shapes) to results panel + dashboard event types. */
function inferAgentResultTypeAndData(normalized) {
	if (!normalized || typeof normalized !== "object")
		return { resultType: null, resultData: null };
	if (normalized.accounts)
		return { resultType: "accounts", resultData: normalized.accounts };
	if (normalized.transactions)
		return { resultType: "transactions", resultData: normalized.transactions };
	if (normalized.balance !== undefined && normalized.error === undefined) {
		return { resultType: "balance", resultData: normalized.balance };
	}
	if (normalized.transaction_id || normalized.transactionId || normalized.id) {
		return { resultType: "confirm", resultData: normalized };
	}
	if (normalized.transaction?.id)
		return { resultType: "confirm", resultData: normalized };
	if (
		normalized.success === true &&
		(normalized.operation === "transfer" ||
			normalized.operation === "deposit" ||
			normalized.operation === "withdrawal")
	) {
		return { resultType: "confirm", resultData: normalized };
	}
	return { resultType: null, resultData: null };
}

/** True when the tool returned an error object (local MCP or consent JSON), not a data payload. */
function isAgentToolErrorResult(normalized) {
	if (!normalized || typeof normalized !== "object") return false;
	if (normalized.accounts || normalized.transactions) return false;
	if (normalized.transaction_id || normalized.transactionId || normalized.id)
		return false;
	if (normalized.balance !== undefined && normalized.error === undefined)
		return false;
	return Boolean(normalized.error);
}

/** Format HTTP trace entries (MCP server → banking API calls) for display in chat */
function formatHttpTrace(trace) {
	if (!trace || trace.length === 0) return "";
	const lines = ["\n\n🌐 **Banking API calls:**"];
	trace.forEach((entry, i) => {
		const status = entry.status
			? ` → ${entry.status} ${entry.ok ? "✅" : "❌"}`
			: entry.ok
				? " ✅"
				: " ❌";
		lines.push(
			`\n**${i + 1}. ${entry.method} \`${entry.url}\`**${status} _(${entry.durationMs}ms)_`,
		);
		if (entry.requestBody) {
			const body = JSON.stringify(entry.requestBody, null, 2).slice(0, 300);
			lines.push(`\`\`\`json\n// Request body\n${body}\n\`\`\``);
		}
		if (entry.responseBody !== undefined) {
			const resp = JSON.stringify(entry.responseBody, null, 2).slice(0, 400);
			lines.push(`\`\`\`json\n// Response\n${resp}\n\`\`\``);
		}
		if (entry.error) {
			lines.push(`_Error: ${entry.error}_`);
		}
	});
	return lines.join("\n");
}

function formatResult(result) {
	const r = normalizeAgentToolResult(result);
	if (!r) return "No data returned.";
	if (
		r.consent_challenge_required ||
		r.error === "consent_challenge_required"
	) {
		const t = r.hitl_threshold_usd ?? 500;
		return `${r.message || "Human approval is required for this amount."}\n\nUse the main dashboard to complete the consent flow for amounts over $${t}. The assistant cannot supply a browser consent challenge.`;
	}
	if (isAgentToolErrorResult(r)) {
		let errorMsg = `❌ ${typeof r.message === "string" ? r.message : r.error}`;
		// Include original MCP request for debugging
		if (r.originalRequest) {
			const reqStr = JSON.stringify(r.originalRequest, null, 2).slice(0, 500); // Truncate for display
			errorMsg += `\n\n📋 **Original request:**\n\`\`\`json\n${reqStr}${Object.keys(r.originalRequest).length > 5 ? "\n..." : ""}\n\`\`\``;
		}
		// Include HTTP trace (request → response to banking API)
		if (r.httpTrace && r.httpTrace.length > 0) {
			errorMsg += formatHttpTrace(r.httpTrace);
		}
		return errorMsg;
	}
	// Accounts list
	if (r.accounts) {
		return r.accounts
			.map((a) => {
				// Normalise field names — MCP server uses camelCase, local tools may use snake_case
				const type = (
					a.accountType ||
					a.account_type ||
					a.type ||
					""
				).toLowerCase();
				const num = a.accountNumber || a.account_number || "";
				const name =
					a.name && a.name !== a.id
						? a.name
						: type.includes("check")
							? "Checking Account"
							: type.includes("sav")
								? "Savings Account"
								: type.includes("loan")
									? "Loan Account"
									: type.includes("crd") || type.includes("credit")
										? "Credit Card"
										: "Account";

				const lines = [];
				lines.push("\u{1f3e6} **" + name + "** (" + (num || a.id || "") + ")");
				lines.push(
					"  Balance:    " +
						formatCurrency(a.balance) +
						" " +
						(a.currency || "USD"),
				);
				if (a.status) lines.push("  Status:     " + a.status);
				if (a.accountHolderName)
					lines.push("  Holder:     " + a.accountHolderName);
				if (a.iban) lines.push("  IBAN:       " + a.iban);
				if (a.swiftCode) lines.push("  SWIFT/BIC:  " + a.swiftCode);
				if (a.branchName)
					lines.push(
						"  Branch:     " +
							a.branchName +
							(a.branchCode ? " (" + a.branchCode + ")" : ""),
					);
				if (a.openedDate)
					lines.push(
						"  Opened:     " + new Date(a.openedDate).toLocaleDateString(),
					);
				lines.push("  Account ID: " + (a.id || ""));
				return lines.join("\n");
			})
			.join("\n\n");
	}
	// Transactions list
	if (r.transactions) {
		return r.transactions
			.slice(0, 10)
			.map(
				(t) =>
					`${t.type}: ${formatCurrency(t.amount)} — ${t.description || ""}\n  ${new Date(t.created_at || t.createdAt).toLocaleDateString()}`,
			)
			.join("\n\n");
	}
	// Balance response
	if (r.balance !== undefined) {
		return `Balance: ${formatCurrency(r.balance)}`;
	}
	// Transaction confirmation
	if (r.transaction_id || r.transactionId || r.id) {
		return `✅ Success\nTransaction ID: ${r.transaction_id || r.transactionId || r.id}\nAmount: ${formatCurrency(r.amount)}`;
	}
	return JSON.stringify(r, null, 2);
}

// ─── Input form for actions that need parameters ──────────────────────────────

function ActionForm({
	action,
	onSubmit,
	onCancel,
	loading,
	effectiveUser,
	liveAccounts,
}) {
	const fakeAccounts = generateFakeAccounts(effectiveUser);
	// Prefer real accounts fetched from the server; fall back to generated placeholders only if
	// the live list hasn't arrived yet (avoids the chk-{uid} vs server-ID mismatch that caused
	// '❌ Account chk-5 not found')
	const accounts =
		liveAccounts && liveAccounts.length > 0 ? liveAccounts : fakeAccounts;

	// Transfer: toAccounts is state-driven so it excludes whichever fromId is selected.
	// We keep it as a separate state to re-derive when fromId changes.
	const [selectedFromId, setSelectedFromId] = React.useState(
		() => accounts[0]?.id,
	);
	const toAccounts = accounts.filter(
		(a) => a.id !== (selectedFromId || accounts[0]?.id),
	);
	// Ensure toId stays valid when fromId changes
	const defaultToId = toAccounts[0]?.id;

	const fields = {
		balance: [
			{ key: "accountId", label: "Account", type: "select", options: accounts },
		],
		deposit: [
			{ key: "accountId", label: "Account", type: "select", options: accounts },
			{
				key: "amount",
				label: "Amount ($)",
				placeholder: "0.00",
				type: "number",
			},
			{ key: "note", label: "Note", placeholder: "optional" },
		],
		withdraw: [
			{ key: "accountId", label: "Account", type: "select", options: accounts },
			{
				key: "amount",
				label: "Amount ($)",
				placeholder: "0.00",
				type: "number",
			},
			{ key: "note", label: "Note", placeholder: "optional" },
		],
		transfer: [
			{
				key: "fromId",
				label: "From Account",
				type: "select",
				options: accounts,
				onChange: (v) => {
					setSelectedFromId(v);
					set("toId", toAccounts.find((a) => a.id !== v)?.id || defaultToId);
				},
			},
			{ key: "toId", label: "To Account", type: "select", options: toAccounts },
			{
				key: "amount",
				label: "Amount ($)",
				placeholder: "0.00",
				type: "number",
			},
			{ key: "note", label: "Note", placeholder: "optional" },
		],
	};

	// Pre-populate selects with their visible default so submitting without touching dropdowns works
	const defaultForm =
		{
			balance: { accountId: accounts[0]?.id },
			deposit: { accountId: accounts[0]?.id },
			withdraw: { accountId: accounts[0]?.id },
			transfer: { fromId: accounts[0]?.id, toId: toAccounts[0]?.id },
		}[action] || {};

	const [form, setForm] = useState(defaultForm);
	const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

	// Keep select defaults in sync when effectiveUser resolves or live accounts arrive
	React.useEffect(() => {
		setForm((f) => {
			const updated = { ...f };
			for (const field of fields[action] || []) {
				if (field.type === "select" && field.options.length > 0) {
					const isValid = field.options.some((o) => o.id === f[field.key]);
					if (!f[field.key] || !isValid)
						updated[field.key] = field.options[0].id;
				}
			}
			return updated;
		});
	}, [effectiveUser?.id, liveAccounts]); // eslint-disable-line react-hooks/exhaustive-deps

	/** Build a normalized submit payload — resolve any missing select values to the displayed default. */
	const handleSubmit = () => {
		const payload = { ...form };
		for (const field of fields[action] || []) {
			if (field.type === "select") {
				const hasValid = field.options.some((o) => o.id === payload[field.key]);
				if (!payload[field.key] || !hasValid)
					payload[field.key] = field.options[0]?.id;
			}
		}
		onSubmit(payload);
	};

	return (
		<div className="banking-agent-form">
			{(fields[action] || []).map((f) => (
				<div key={f.key} className="banking-agent-field">
					<label htmlFor={`field-${f.key}`}>{f.label}</label>
					{f.type === "select" ? (
						<select
							id={`field-${f.key}`}
							value={form[f.key] || f.options[0]?.id || ""}
							onChange={(e) => {
								set(f.key, e.target.value);
								f.onChange?.(e.target.value);
							}}
							className="banking-agent-select"
						>
							{f.options.map((option) => (
								<option key={option.id} value={option.id}>
									{option.name} ({option.accountNumber}) -{" "}
									{formatCurrency(option.balance)}
								</option>
							))}
						</select>
					) : (
						<input
							id={`field-${f.key}`}
							type={f.type || "text"}
							placeholder={f.placeholder}
							value={form[f.key] || ""}
							onChange={(e) => set(f.key, e.target.value)}
						/>
					)}
				</div>
			))}
			<div className="banking-agent-form-actions">
				<button
					type="button"
					className="banking-agent-btn-primary"
					disabled={loading}
					onClick={handleSubmit}
				>
					{loading ? "…" : "Run"}
				</button>
				<button
					type="button"
					className="banking-agent-btn-ghost"
					onClick={onCancel}
				>
					Cancel
				</button>
			</div>
		</div>
	);
}

// ─── Results Panel (side panel showing rich formatted data next to the agent) ──

function AccountsTable({ accounts }) {
	if (!accounts?.length)
		return <p className="bar-rp-empty">No accounts found.</p>;

	// Helper function to generate friendly account names
	const getFriendlyAccountName = (account) => {
		if (account.name && account.name !== account.id) {
			return account.name;
		}

		const accountType = (
			account.account_type ||
			account.type ||
			""
		).toLowerCase();
		const accountNumber = account.account_number || account.id || "";

		// Create friendly name based on type and number
		if (accountType === "checking" || accountType.includes("chk")) {
			return accountNumber
				? `Checking Account (${accountNumber.slice(-4)})`
				: "Checking Account";
		} else if (accountType === "savings" || accountType.includes("sav")) {
			return accountNumber
				? `Savings Account (${accountNumber.slice(-4)})`
				: "Savings Account";
		} else if (accountType === "credit" || accountType.includes("crd")) {
			return accountNumber
				? `Credit Card (${accountNumber.slice(-4)})`
				: "Credit Card";
		} else if (accountType === "investment" || accountType.includes("inv")) {
			return accountNumber
				? `Investment Account (${accountNumber.slice(-4)})`
				: "Investment Account";
		} else {
			return accountNumber ? `Account (${accountNumber.slice(-4)})` : "Account";
		}
	};

	return (
		<table className="bar-rp-table">
			<thead>
				<tr>
					<th>Type</th>
					<th>Account Name</th>
					<th>Balance</th>
				</tr>
			</thead>
			<tbody>
				{accounts.map((a, i) => (
					<tr key={a.account_number || a.id || i}>
						<td>{a.account_type || a.type || "Account"}</td>
						<td>
							<code>{getFriendlyAccountName(a)}</code>
						</td>
						<td className="bar-rp-amount">{formatCurrency(a.balance)}</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}

function TransactionsTable({ transactions }) {
	if (!transactions?.length)
		return <p className="bar-rp-empty">No transactions found.</p>;
	return (
		<table className="bar-rp-table">
			<thead>
				<tr>
					<th>Type</th>
					<th>Amount</th>
					<th>Description</th>
					<th>Date</th>
				</tr>
			</thead>
			<tbody>
				{transactions.slice(0, 20).map((t, i) => (
					<tr key={t.id || i}>
						<td>
							<span
								className={`bar-rp-type bar-rp-type-${(t.type || "").toLowerCase()}`}
							>
								{t.type}
							</span>
						</td>
						<td className="bar-rp-amount">{formatCurrency(t.amount)}</td>
						<td className="bar-rp-desc" title={t.description || ""}>
							{t.description || "—"}
						</td>
						<td className="bar-rp-date">
							{new Date(
								t.created_at || t.createdAt || Date.now(),
							).toLocaleDateString()}
						</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}

/** Renders sequential_think reasoning steps as a collapsible block. */
function ReasoningSteps({ steps, conclusion }) {
	if (!steps?.length && !conclusion) {
		return (
			<div className="ba-reasoning ba-reasoning--empty">
				<span className="ba-reasoning__icon" aria-hidden>
					🧠
				</span>
				<span
					className="ba-reasoning__label"
					style={{
						color: "var(--color-text-secondary,#6b7280)",
						fontSize: "0.85rem",
						marginLeft: 6,
					}}
				>
					Sequential thinking unavailable (MCP server not connected)
				</span>
			</div>
		);
	}
	return (
		<details className="ba-reasoning" open>
			<summary className="ba-reasoning__summary">
				<span className="ba-reasoning__icon" aria-hidden>
					🧠
				</span>
				<span className="ba-reasoning__label">
					Reasoning ({steps?.length ?? 0} steps)
				</span>
			</summary>
			<div className="ba-reasoning__body">
				<ol className="ba-reasoning__steps">
					{steps.map((step, i) => (
						<li key={i} className="ba-reasoning__step">
							<span className="ba-reasoning__step-title">{step.title}</span>
							{step.description && (
								<p className="ba-reasoning__step-desc">{step.description}</p>
							)}
						</li>
					))}
				</ol>
				{conclusion && (
					<p className="ba-reasoning__conclusion">💡 {conclusion}</p>
				)}
			</div>
		</details>
	);
}

/** Renders MCP-style tool step chips (read/update account, transactions) between user ask and reply. */
function ToolProgressChips({ steps }) {
	if (!steps?.length) return null;
	return (
		<ul className="ba-tool-progress" aria-label="Tool calls">
			{steps.map((s, i) => (
				<li key={`${s.name}-${i}`} className="ba-tool-chip">
					<span className="ba-tool-chip-ico" aria-hidden />
					<span className="ba-tool-chip-name">{s.name}</span>
					<span className="ba-tool-chip-sep">·</span>
					<span
						className={`ba-tool-chip-status ba-tool-chip-status--${s.status}`}
					>
						{s.status === "running"
							? "Running…"
							: s.status === "success"
								? "Success"
								: "Failed"}
					</span>
					<span className="ba-tool-chip-chev" aria-hidden>
						›
					</span>
				</li>
			))}
		</ul>
	);
}

function ResultsPanel({ panel, onClose, style }) {
	const [size, setSize] = useState({ width: 340, height: 420 });
	const resizingRef = useRef(null);

	const onResizeMouseDown = useCallback(
		(e, dir) => {
			if (e.button !== 0) return;
			e.preventDefault();
			e.stopPropagation();
			const startX = e.clientX;
			const startY = e.clientY;
			const startW = size.width;
			const startH = size.height;
			resizingRef.current = { startX, startY, startW, startH, dir };

			const onMove = (ev) => {
				const {
					startX: sx,
					startY: sy,
					startW: sw,
					startH: sh,
					dir: d,
				} = resizingRef.current;
				const dx = ev.clientX - sx;
				const dy = ev.clientY - sy;
				setSize({
					width: d === "e" || d === "se" ? Math.max(240, sw + dx) : sw,
					height: d === "s" || d === "se" ? Math.max(160, sh + dy) : sh,
				});
			};
			const onUp = () => {
				resizingRef.current = null;
				document.removeEventListener("mousemove", onMove);
				document.removeEventListener("mouseup", onUp);
				document.body.style.cursor = "";
				document.body.style.userSelect = "";
			};
			document.body.style.userSelect = "none";
			document.body.style.cursor =
				dir === "se" ? "nwse-resize" : dir === "e" ? "ew-resize" : "s-resize";
			document.addEventListener("mousemove", onMove);
			document.addEventListener("mouseup", onUp);
		},
		[size],
	);

	if (!panel) return null;
	return (
		<aside
			className="banking-agent-results-panel"
			style={{ ...style, width: size.width, maxHeight: size.height }}
			aria-label="Results"
		>
			<div className="bar-rp-header">
				<span className="bar-rp-title">{panel.title}</span>
				<button
					type="button"
					className="bar-rp-close"
					onClick={onClose}
					aria-label="Close results"
				>
					✕
				</button>
			</div>
			<div className="bar-rp-body">
				{panel.type === "accounts" && <AccountsTable accounts={panel.data} />}
				{panel.type === "transactions" && (
					<TransactionsTable transactions={panel.data} />
				)}
				{panel.type === "balance" && (
					<div className="bar-rp-balance">
						<span className="bar-rp-balance-label">Balance</span>
						<span className="bar-rp-balance-value">
							{formatCurrency(panel.data)}
						</span>
					</div>
				)}
				{panel.type === "confirm" && (
					<div className="bar-rp-confirm">
						<span className="bar-rp-confirm-icon">✅</span>
						<div className="bar-rp-confirm-body">
							<div className="bar-rp-confirm-label">{panel.title}</div>
							{panel.data?.transaction_id && (
								<div>
									Transaction ID: <code>{panel.data.transaction_id}</code>
								</div>
							)}
							{panel.data?.amount && (
								<div>Amount: {formatCurrency(panel.data.amount)}</div>
							)}
						</div>
					</div>
				)}
				{panel.type === "text" && (
					<div className="bar-rp-text">{panel.data}</div>
				)}
			</div>
			{/* Resize handles */}
			<div
				className="bar-rp-resize-e"
				onMouseDown={(e) => onResizeMouseDown(e, "e")}
				aria-hidden
			/>
			<div
				className="bar-rp-resize-s"
				onMouseDown={(e) => onResizeMouseDown(e, "s")}
				aria-hidden
			/>
			<div
				className="bar-rp-resize-se"
				onMouseDown={(e) => onResizeMouseDown(e, "se")}
				aria-label="Resize"
				title="Drag to resize"
			/>
		</aside>
	);
}

// ─── Main component ────────────────────────────────────────────────────────────

function welcomeMessage(
	u,
	focus = "banking",
	brandShortName = "Super Banking",
	industryPresetId = "bx_finance",
) {
	if (focus === "config") {
		if (!u) {
			return `Ask about PingOne, redirect URIs, OAuth scopes, **Agent MCP scopes** (limit transfers vs read-only), environment variables, and **industry branding** (${brandShortName} vs other presets) for this demo.`;
		}
		const name = u.firstName || u.name?.split(" ")[0] || "there";
		if (u.role === "admin") {
			return `Hi ${name} — you're on Application Configuration. Ask about environment IDs, worker apps, redirect URIs, OAuth, **Industry & branding** (\`ui_industry_preset\`), or **Agent MCP scopes** (\`agent_mcp_allowed_scopes\`) — turn off transfers for a read-only agent demo; the BFF runs RFC 8693 token exchange on each tool call with the selected scopes. Banking shortcuts are hidden here. Theme: **${brandShortName}**.`;
		}
		return `Hi ${name} — you're on Application Configuration. Ask how to connect PingOne, switch branding (e.g. FunnyBank), or limit the agent with **Agent MCP scopes** (e.g. disable transfers). Theme: **${brandShortName}**.`;
	}
	if (!u) return "You're signed in! What would you like to do?";
	const name = u.firstName || u.name?.split(" ")[0] || "there";
	if (u.role === "admin") {
		return `Welcome, ${name}! As an admin you can query accounts system-wide, view all transactions, manage users, and explore PingOne OAuth flows. What would you like to do?`;
	}
	const isRetail = industryPresetId === "retail";
	return isRetail
		? `Hi ${name}! I can browse products, check prices, help with your cart, and explain the OAuth flows securing your checkout. What would you like to do?`
		: `Hi ${name}! I can check your balances, move money between accounts, and explain the OAuth flows happening behind the scenes. What would you like to do?`;
}

function normalizeBankingParams(params) {
	const p = { ...(params || {}) };
	if (p.account_id && !p.accountId) p.accountId = p.account_id;
	if (p.from_account_id && !p.fromId) p.fromId = p.from_account_id;
	if (p.to_account_id && !p.toId) p.toId = p.to_account_id;
	return p;
}

/**
 * Parses simple log-focused prompts into a structured query command.
 */
function parseLogPrompt(text) {
	const t = String(text || "").trim();
	if (!t) return null;
	const lower = t.toLowerCase();

	const errorMatch =
		lower.match(
			/(?:show|list|give me|get)\s+(?:me\s+)?(?:the\s+)?last\s+(\d+)\s+errors?/,
		) || lower.match(/last\s+(\d+)\s+errors?/);
	if (errorMatch) {
		return {
			type: "errors",
			limit: Math.min(Math.max(parseInt(errorMatch[1], 10) || 5, 1), 50),
		};
	}

	const loginMatch =
		lower.match(/last\s+success(?:ful)?\s+login\s+for\s+([a-z0-9._@-]+)/i) ||
		lower.match(/last\s+login\s+for\s+([a-z0-9._@-]+)/i);
	if (loginMatch) {
		return { type: "last_login", username: loginMatch[1] };
	}

	return null;
}

// ─── Token event formatter for chat display ───────────────────────
function formatTokenEvent(evt) {
	if (!evt?.type) return null;
	if (evt.type === "token_exchange")
		return `🔄 Token exchanged (RFC 8693) — agent=${evt.actor || "agent"}, user=${evt.onBehalfOf || "user"}`;
	if (evt.type === "tool_call")
		return `🔧 Tool: ${evt.tool} → ${evt.status || "called"}`;
	return null;
}

// ─── Education topic inline messages (module-level for performance) ───────────

const TOPIC_MESSAGES = {
	"login-flow": `🔐 Authorization Code + PKCE Flow:\n\n1. App generates code_verifier (random 64 bytes) + code_challenge (SHA-256 hash)\n2. Browser redirects to PingOne /as/authorize with challenge\n3. User authenticates → PingOne redirects back with code\n4. Backend-for-Frontend (BFF) exchanges code + verifier for tokens (server-side only)\n5. Browser never sees the token — only a session cookie\n\nPKCE prevents interception: even if code is stolen, attacker can't exchange it without the verifier.`,
	"token-exchange": `🔄 RFC 8693 Token Exchange (User token → MCP token):\n\nWhy: The user token has broad scope. The MCP server needs a narrowly-scoped MCP token for least-privilege.\n\nHow:\n• Backend-for-Frontend (BFF) holds the User token (session access token)\n• Backend-for-Frontend (BFF) calls PingOne /as/token with grant_type=urn:ietf:params:oauth:grant-type:token-exchange\n• User token is subject_token; agent client credentials are actor_token\n• PingOne validates may_act on the User token and issues an MCP token\n• MCP token has: sub=user, act={client_id=agent}, narrow scope, MCP audience\n\nmay_act on the User token → act on the MCP token — proving delegation chain.`,
	"may-act": `📋 may_act / act Claims (RFC 8693 §4.1):\n\nmay_act on the User token: "this client is allowed to act on my behalf"\n  { "sub": "user-uuid", "may_act": { "client_id": "bff-admin-client" } }\n\nact on the MCP token (exchanged token): "this action was delegated"\n  { "sub": "user-uuid", "act": { "client_id": "bff-admin-client" } }\n\nThe MCP server validates act to confirm the Backend-for-Frontend (BFF) is the authorized actor — not just any client that got a token.`,
	"mcp-protocol": `⚙️ Model Context Protocol (MCP):\n\nMCP is a JSON-RPC 2.0 protocol over WebSocket (or stdio/SSE) for AI tools.\n\nHandshake:\n  initialize → { protocolVersion, capabilities, serverInfo }\n  → notifications/initialized (client notification)\n\nDiscovery:\n  tools/list → [{ name, description, inputSchema }]\n\nExecution:\n  tools/call { name, arguments } → { content: [{ type, text }] }\n\nIn this demo:\n  Browser → Backend-for-Frontend (BFF) (/api/mcp/tool) → MCP Server (WebSocket) → Banking API\n\nToken flow: Backend-for-Frontend (BFF) performs RFC 8693 exchange before forwarding tool calls.`,
	introspection: `🔍 RFC 7662 Token Introspection:\n\nThe MCP server calls PingOne to validate tokens in real-time:\n  POST /as/introspect\n  { token: "...", token_type_hint: "access_token" }\n  → { active: true, sub, scope, exp, aud }\n\nWhy not just verify the JWT locally?\n• Catches revoked tokens (user logged out, compromised session)\n• Zero-trust: every tool call re-validates the token\n• Results cached 60s to avoid hammering PingOne`,
	"step-up": `⬆️ Step-Up Authentication:\n\nTriggered when a high-value action requires stronger auth:\n• Transfer ≥ $250 → require MFA\n• Backend-for-Frontend (BFF) returns HTTP 428 with WWW-Authenticate: Bearer scope="step_up"\n\nTwo methods:\n1. CIBA: PingOne pushes challenge to user's device (out-of-band)\n2. Redirect: Browser redirects to /api/auth/oauth/user/stepup?acr_values=Multi_factor\n\nAfter approval, PingOne issues new token with higher ACR — Backend-for-Frontend (BFF) stores it and retries the original transaction.`,
	"agent-gateway": `🌐 Agent Gateway / Resource Indicators (RFC 8707):\n\nRFC 8707: client specifies the resource URI when requesting a token\n  /as/token?resource=https://mcp.example.com\n  → token aud = "https://mcp.example.com"\n\nRFC 9728: Protected Resource Metadata\n  GET https://mcp.example.com/.well-known/oauth-protected-resource\n  → { resource, authorization_servers, scopes_supported }\n\nThis lets a dynamic AI agent discover what auth is needed before attempting a tool call — no hardcoded configuration.`,
	"pingone-authorize": `🔐 PingOne Authorize (DaVinci):\n\nPingOne Authorize evaluates access policies at runtime using DaVinci flows.\n\nIn this demo it drives:\n• Step-up MFA triggers (ACR values like "Multi_factor")\n• CIBA push notifications to the user's device\n• Dynamic consent for high-value transactions\n\nThe acr_values parameter in /as/authorize tells PingOne which DaVinci policy to run.`,
	cimd: `📄 Client ID Metadata Document (CIMD / RFC 7591):\n\nTraditional OAuth: client_id is an opaque string, pre-registered in the AS.\nCIMD: client_id is a URL you control — it hosts the client's metadata.\n\nThe AS fetches the URL to discover:\n  { redirect_uris, grant_types, scope, client_name, logo_uri, … }\n\nBenefits:\n• No pre-registration — client registers itself\n• Client controls updates (change the hosted document)\n• Works across AS instances that support DCR/RFC 7591\n\nIn this demo: click "▶ Simulate" in the CIMD panel to see PingOne dynamic client registration.`,
	langchain: `🔗 LangChain (LCEL + Ollama):\n\nLangChain 0.3.x modernises AI agent composition:\n• LCEL (LangChain Expression Language): chain = prompt | llm.bind_tools(tools)\n• Local inference via Ollama — no cloud API keys required\n• Security: all LLM calls stay on localhost — nothing leaves your network\n\nIn this demo: the Chat Widget badge shows the active Ollama model.\nDeep dive: open /langchain or click the badge → Learn more →`,
	"human-in-loop": `👤 Human-in-the-loop (HITL) for the banking agent:\n\n• Over $500 the server issues a consent challenge in your session; after you confirm in the consent popup, POST /transactions must include matching consentChallengeId (one-time use).\n• The agent cannot complete that path without your browser session.\n• If you decline, this demo disables the assistant until you sign out and sign in again.\n• HITL ≠ MITM (attack). Open the drawer: What is HITL · Patterns & best practices · This app and the agent · Declining and lockout.`,
};

// ─── Inline HITL consent card (middle / dock surfaces) ─────────────────

/**
 * HitlInlineCard — Rendered inside the chat panel for middle/dock surfaces.
 * Replicates the consent-challenge flow without a portal overlay.
 */
function HitlInlineCard({ transaction, threshold, onConfirm, onCancel }) {
	const [submitting, setSubmitting] = useState(false);
	const isHighValue =
		transaction && Number(transaction.amount || 0) >= threshold;

	return (
		<div
			className={`ba-inline-consent-card${isHighValue ? " ba-inline-consent-card--high-value" : ""}`}
		>
			<div className="ba-inline-consent-head">🔒 Confirm Action</div>
			{transaction && (
				<ul className="ba-inline-consent-details">
					<li>
						💰 <strong>Amount:</strong> $
						{Number(transaction.amount || 0).toFixed(2)}
					</li>
					{transaction.type && (
						<li>
							📋 <strong>Type:</strong> {transaction.type}
						</li>
					)}
					{transaction.fromAccountId && (
						<li>
							📤 <strong>From:</strong> {transaction.fromAccountId}
						</li>
					)}
					{transaction.toAccountId && (
						<li>
							📥 <strong>To:</strong> {transaction.toAccountId}
						</li>
					)}
					{transaction.description && (
						<li>
							📝 <strong>Note:</strong> {transaction.description}
						</li>
					)}
				</ul>
			)}
			{isHighValue && (
				<div className="ba-inline-consent-warning">
					⚠ This transaction exceeds ${Number(threshold).toLocaleString()}.
					Please verify before confirming.
				</div>
			)}
			<div className="ba-inline-consent-actions">
				<button
					type="button"
					className="ba-inline-consent-cancel"
					onClick={onCancel}
					disabled={submitting}
				>
					Cancel
				</button>
				<button
					type="button"
					className="ba-inline-consent-confirm"
					disabled={submitting}
					onClick={async () => {
						setSubmitting(true);
						await onConfirm();
						setSubmitting(false);
					}}
				>
					{submitting ? "Processing…" : "Confirm ✓"}
				</button>
			</div>
		</div>
	);
}

/**
 * @param {object} props
 * @param {'float' | 'inline'} [props.mode]
 * @param {boolean} [props.embeddedDockBottom] When inline, stack chat on top and suggestions below (dashboard bottom bar)
 * @param {'banking' | 'config'} [props.embeddedFocus] When `config`, dock on Application Configuration emphasizes setup (not transfers).
 * @param {boolean} [props.distinctFloatingChrome] When floating, stronger card/chrome so it reads as a separate widget vs the page.
 * @param {boolean} [props.splitColumnChrome] Inline mode: compact “assistant” chrome for token | agent | banking columns (navy header, chat bubbles).
 */
export default function BankingAgent({
	user,
	onLogout,
	mode = "float",
	embeddedDockBottom = false,
	embeddedFocus = "banking",
	distinctFloatingChrome = false,
	splitColumnChrome = false,
	showPopOut = false,
	onPopout,
}) {
	const isInline = mode === "inline";
	const isBottomDock = isInline && embeddedDockBottom;
	const isConfigEmbeddedFocus = embeddedFocus === "config";
	const splitChrome = Boolean(splitColumnChrome && isInline);
	const { preset: industryPreset } = useIndustryBranding();
	const brandShortName = industryPreset.shortName;
	const edu = useEducationUIOptional();
	const tokenChain = useTokenChainOptional();
	const {
		theme: appTheme,
		toggleTheme,
		agentAppearance,
		setAgentAppearance,
		effectiveAgentTheme,
	} = useTheme();
	const [isOpen, setIsOpen] = useState(() => {
		if (typeof window === "undefined") return false;
		if (isInline) return false;
		try {
			const saved = localStorage.getItem("banking-agent-open");
			if (saved !== null) return saved === "true";
		} catch {}
		return isBankingAgentFloatingDefaultOpen(window.location.pathname);
	});
	/** Panel light/dark: default follows page (`auto`); can override in header. */
	const isDark = effectiveAgentTheme === "dark";
	const [isExpanded, setIsExpanded] = useState(false);
	/** Discovery popout — "All actions" overlay. */
	const [showDiscovery, setShowDiscovery] = useState(false);
	const [discoverySearch, setDiscoverySearch] = useState("");
	const discoveryTriggerRef = useRef(null);

	/** Close discovery popout on Escape. First Escape clears search; second closes popout. */
	useEffect(() => {
		if (!showDiscovery) return;
		const onKey = (e) => {
			if (e.key === "Escape") {
				if (discoverySearch) {
					setDiscoverySearch("");
				} else {
					setShowDiscovery(false);
					discoveryTriggerRef.current?.focus();
				}
			}
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [showDiscovery, discoverySearch]);

	const [nlInput, setNlInput] = useState("");
	const [nlLoading, setNlLoading] = useState(false);
	const [nlMeta, setNlMeta] = useState(null);
	/** Set when returning from PingOne with a pending banking NL line to run after session exists. */
	const [nlResumeAfterAuth, setNlResumeAfterAuth] = useState(null);
	const [activeAction, setActiveAction] = useState(null);
	const [messages, setMessages] = useState([]);
	const [loading, setLoading] = useState(false);
	/** null = loading; which OAuth flows have client IDs + environment */
	const [oauthConfig, setOauthConfig] = useState(null);
	/** {x,y} when panel has been dragged; null = CSS-anchored default position */
	const [dragPos, setDragPos] = useState(null);
	/** Panel dimensions for resizing — floating default is large enough for header, chips, and two-column body */
	const [panelSize, setPanelSize] = useState({ width: 540, height: 540 });
	/** Side panel showing rich results next to the agent */
	const [resultPanel, setResultPanel] = useState(null);
	/** Live bounding rect of the agent panel — used to anchor the results pop-out */
	const [agentBounds, setAgentBounds] = useState(null);
	/** MCP server connection status for header display */
	const [mcpStatus, setMcpStatus] = useState({
		toolCount: null,
		connected: false,
	});
	/** Real accounts from /api/accounts/my — used for the balance/deposit/withdraw/transfer form
	 *  dropdowns so IDs always match what the server has stored (avoids chk-{uid} mismatch). */
	const [liveAccounts, setLiveAccounts] = useState([]);
	/**
	 * Self-detected session user — populated by independent auth check so the
	 * agent knows the session even if the parent App.js user prop hasn't resolved yet.
	 */
	const [sessionUser, setSessionUser] = useState(null);
	const sessionUserRef = useRef(null);
	sessionUserRef.current = sessionUser;
	const [sessionRefreshing, setSessionRefreshing] = useState(false);
	/** True when identity came from _auth cookie / stub token — MCP and NL need a Redis-backed session. */
	const [cookieOnlyBffSession, setCookieOnlyBffSession] = useState(false);
	/** True while the 2s reconnect poll is actively running (shows "Reconnecting…" banner). */
	const [sessionReconnecting, setSessionReconnecting] = useState(false);
	/** Avoid repeating the session-fix error bubble after we showed it on load or after a failed action. */
	const sessionFixBubbleShownRef = useRef(false);
	/** User declined high-value consent — tools/chat disabled until sign-out (agentAccessConsent). */
	// Always start false — the block is session-scoped, not page-load-scoped.
	// Clear any stale localStorage value immediately so refresh/login never shows the banner.
	// OTP step-up modal state (Phase 174)
	const [showOtpModal, setShowOtpModal] = useState(false);
	const [otpContextLine, setOtpContextLine] = useState("");
	const pendingOtpActionRef = useRef(null);
	// Callback to fire after OTP step-up completes (e.g. sensitive data fetch post-HITL)
	const pendingStepUpCallbackRef = useRef(null);
	// MCP tools list modal state
	const [showMcpToolsModal, setShowMcpToolsModal] = useState(false);
	const [mcpToolsList, setMcpToolsList] = useState([]);
	// Account details panel state
	const [accountDetailsPanel, setAccountDetailsPanel] = useState(null);
	const [accountDetailsPanelPos, setAccountDetailsPanelPos] = useState({
		x: 200,
		y: 100,
	});
	// FIDO2 + P1MFA state (Phase 174-03/04)
	const [stepUpMethod, setStepUpMethod] = useState("otp"); // 'otp' or 'fido'
	const [supportsFido, setSupportsFido] = useState(false);
	const [p1mfaMode, setP1mfaMode] = useState(false);
	const [p1mfaDaId, setP1mfaDaId] = useState(null);
	const [p1mfaDevices, setP1mfaDevices] = useState([]);
	const [consentBlocked, setConsentBlocked] = useState(false);
	// Detect FIDO2/WebAuthn support on mount
	useEffect(() => {
		setSupportsFido(
			typeof window !== "undefined" && window.PublicKeyCredential !== undefined,
		);
	}, []);
	/** Group expand/collapse state for chip categories — defaults per D-06, persisted in localStorage. */
	const [chipGroupsState, setChipGroupsState] = useState(() => {
		try {
			const saved = localStorage.getItem("ba_chip_groups_state");
			if (saved) {
				return JSON.parse(saved);
			}
		} catch (e) {
			console.warn("Failed to load ba_chip_groups_state from localStorage:", e);
		}
		// Default state per D-06: Account expanded, Transaction and Admin collapsed
		return {
			account: true,
			transaction: false,
			admin: false,
			testing: false,
		};
	});

	/** Persist chipGroupsState changes to localStorage. */
	useEffect(() => {
		try {
			localStorage.setItem(
				"ba_chip_groups_state",
				JSON.stringify(chipGroupsState),
			);
		} catch (e) {
			console.warn("Failed to save ba_chip_groups_state to localStorage:", e);
		}
	}, [chipGroupsState]);

	/** Toggle expanded/collapsed state for a group. */
	const toggleGroupExpanded = (groupName) => {
		setChipGroupsState((prev) => ({
			...prev,
			[groupName]: !prev[groupName],
		}));
	};

	/** True when any action group is currently expanded. */
	const anyExpanded = Object.values(chipGroupsState).some(Boolean);

	/** Collapse all action groups. */
	const collapseAllGroups = () => {
		setChipGroupsState(
			Object.fromEntries(Object.keys(ACTION_GROUPS).map((k) => [k, false]))
		);
	};

	/** Expand all action groups. */
	const expandAllGroups = () => {
		setChipGroupsState(
			Object.fromEntries(Object.keys(ACTION_GROUPS).map((k) => [k, true]))
		);
	};

	/** Token chain visibility and width — persisted to localStorage. */
	const [showTokenChain, setShowTokenChain] = useState(() => {
		try {
			const saved = localStorage.getItem("ba_token_chain_show");
			if (saved !== null) return saved === "true";
		} catch {}
		return false; // Default: hidden
	});

	const [tokenChainWidth, setTokenChainWidth] = useState(() => {
		try {
			const saved = localStorage.getItem("ba_token_chain_width");
			if (saved !== null)
				return Math.max(50, Math.min(200, parseInt(saved, 10)));
		} catch {}
		return 80; // Default: 80px
	});

	/** Persist token chain visibility to localStorage. */
	useEffect(() => {
		try {
			localStorage.setItem("ba_token_chain_show", String(showTokenChain));
		} catch (e) {
			console.warn("Failed to save ba_token_chain_show to localStorage:", e);
		}
	}, [showTokenChain]);

	/** Persist token chain width to localStorage. */
	useEffect(() => {
		try {
			localStorage.setItem("ba_token_chain_width", String(tokenChainWidth));
		} catch (e) {
			console.warn("Failed to save ba_token_chain_width to localStorage:", e);
		}
	}, [tokenChainWidth]);

	/** Handle resizing token chain middle column. */
	const handleTokenChainResize = useCallback(
		(e) => {
			if (e.button !== 0) return; // Only left mouse button
			const startX = e.clientX;
			const startWidth = tokenChainWidth;

			const handleMouseMove = (moveEvent) => {
				const deltaX = moveEvent.clientX - startX;
				const newWidth = Math.max(50, Math.min(200, startWidth + deltaX));
				setTokenChainWidth(newWidth);
			};

			const handleMouseUp = () => {
				document.removeEventListener("mousemove", handleMouseMove);
				document.removeEventListener("mouseup", handleMouseUp);
			};

			document.addEventListener("mousemove", handleMouseMove);
			document.addEventListener("mouseup", handleMouseUp);
		},
		[tokenChainWidth],
	);

	/** Render a single action button with optional emoji-only styling. */
	const renderChip = (action, groupName) => {
		return (
			<button
				key={action.id}
				type="button"
				className="ba-action-item ba-action-chip"
				onClick={() => handleActionClick(action.id)}
				disabled={
					loading ||
					(consentBlocked && action.id !== "logout") ||
					(showOtpModal && action.id !== "logout")
				}
				title={action.desc || action.label}
			>
				{action.label}
			</button>
		);
	};

	/** Ordered group list for the discovery popout. */
	const allDiscoveryGroups = useMemo(
		() => [
			{ key: "account",     label: "Account",        chips: ACTION_GROUPS.account,     isEducation: false },
			{ key: "transaction", label: "Transaction",     chips: ACTION_GROUPS.transaction,  isEducation: false },
			{ key: "admin",       label: "Admin",           chips: ACTION_GROUPS.admin,        isEducation: false },
			{ key: "testing",     label: "Testing",         chips: ACTION_GROUPS.testing,      isEducation: false },
			{ key: "learn",       label: "Learn & Explore", chips: EDUCATION_COMMANDS,         isEducation: true  },
		],
		[]
	);

	/** Live filtered view of allDiscoveryGroups based on discoverySearch. */
	const filteredDiscoveryGroups = useMemo(() => {
		const q = discoverySearch.trim().toLowerCase();
		if (!q) return allDiscoveryGroups;
		return allDiscoveryGroups
			.map((group) => ({
				...group,
				chips: group.chips.filter((c) => c.label.toLowerCase().includes(q)),
			}))
			.filter((g) => g.chips.length > 0);
	}, [discoverySearch, allDiscoveryGroups]);

	/** Render ACTION_GROUPS with collapsible headers, count badges, and collapse-all toolbar. */
	const renderActionGroups = () => {
		let groupsToRender = { ...ACTION_GROUPS };
		if (isConfigEmbeddedFocus) {
			groupsToRender = { admin: ACTION_GROUPS.admin || [] };
		}

		return (
			<>
				<div className="ba-chips-toolbar">
					<button
						type="button"
						className="ba-collapse-all-btn"
						onClick={anyExpanded ? collapseAllGroups : expandAllGroups}
					>
						{anyExpanded ? "Collapse all" : "Expand all"}
					</button>
				</div>

				{Object.entries(groupsToRender).map(([groupName, actions]) => {
					const isExpanded = !!chipGroupsState[groupName];
					const capitalizedName =
						groupName.charAt(0).toUpperCase() + groupName.slice(1);
					return (
						<div
							key={groupName}
							className={"ba-action-group ba-action-group--" + groupName}
						>
							<button
								className="ba-group-header"
								onClick={() => toggleGroupExpanded(groupName)}
								type="button"
								title={
									(isExpanded ? "Collapse" : "Expand") +
									" " +
									capitalizedName +
									" actions"
								}
							>
								<span className="ba-group-name">{capitalizedName}</span>
								<span className="ba-group-count">({actions.length})</span>
								<span
									className={
										"ba-group-toggle " + (isExpanded ? "expanded" : "collapsed")
									}
								>
									{isExpanded ? "▼" : "▶"}
								</span>
							</button>
							<div
								className={"ba-group-content " + (isExpanded ? "" : "collapsed")}
							>
								{actions.map((action) => renderChip(action, groupName))}
							</div>
						</div>
					);
				})}
			</>
		);
	};
	/** True when the user has accepted the in-app agent consent agreement. */
	/** Missing-scopes error from token exchange — shows config-fix modal. */
	const [scopeErrorModal, setScopeErrorModal] = useState(null);
	/** Pending action awaiting scope-upgrade consent — replayed automatically after exchange. */
	const pendingScopeUpgradeRef = useRef(null);

	/** Pending HITL intent — shows AgentConsentModal (transaction mode) before OTP. */
	const [hitlPendingIntent, setHitlPendingIntent] = useState(null);

	/** Challenge ID issued after the user clicks Authorize in AgentConsentModal. */
	const [hitlChallengeId, setHitlChallengeId] = useState(null);
	/** Pending action awaiting CIBA step-up approval (ref: read in event listener closure). */
	const pendingStepUpActionRef = useRef(null);
	/** Pending action awaiting auth-challenge login (ref: read in event listener closure).
	 *  Also persisted to sessionStorage so it survives PingOne full-page redirect. */
	const pendingAuthChallengeActionRef = useRef(
		(() => {
			try {
				const stored = sessionStorage.getItem("_agent_pending_auth_action");
				if (stored) {
					sessionStorage.removeItem("_agent_pending_auth_action");
					return JSON.parse(stored);
				}
			} catch {
				/* ignore */
			}
			return null;
		})(),
	);

	const bottomRef = useRef(null);
	const messagesContainerRef = useRef(null);
	/** Bottom-dock: scroll transfer/deposit form into view (messages flex used to clip Run). */
	const actionFormAnchorRef = useRef(null);
	const toolProgressIdRef = useRef(null);
	const panelRef = useRef(null);
	const isDraggingRef = useRef(false);
	const dragOffsetRef = useRef({ x: 0, y: 0 });
	const navigate = useNavigate();
	const location = useLocation();
	const [searchParams] = useSearchParams();
	// On the /agent route the inline/full-page instance is shown — hide duplicate float
	const isAgentPage = location.pathname === "/agent";
	/** Landing `/`: agent success/info/error toasts use longer autoClose (readable for guests). */
	const agentToastMs = useMemo(() => {
		const slow = isPublicMarketingAgentPath(location.pathname);
		return {
			successAction: slow ? 7500 : 2500,
			toolsLoaded: slow ? 7000 : 2000,
			errShort: slow ? 10000 : 5000,
			infoToken: slow ? 8500 : 4500,
		};
	}, [location.pathname]);

	useEffect(() => {
		const sync = () => setConsentBlocked(isAgentBlockedByConsentDecline());
		window.addEventListener("bankingAgentConsentBlockChanged", sync);
		return () =>
			window.removeEventListener("bankingAgentConsentBlockChanged", sync);
	}, []);

	// Clear parent's consent decline state on mount (React Rule: no setState in render initializers)
	useEffect(() => {
		setAgentBlockedByConsentDecline(false);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		if (consentBlocked) setActiveAction(null);
	}, [consentBlocked]);

	// Listen for UserDashboard confirming a HITL consent challenge.
	// The modal already executes the transaction — we just surface the success message in the agent.
	useEffect(() => {
		const onConfirmed = (e) => {
			const { actionId, successMsg } = e.detail || {};
			const label = ACTIONS.find((a) => a.id === actionId)?.label || actionId;
			addMessage(
				"assistant",
				`✅ **${label} approved and completed.**\n\n${successMsg || "The transaction went through after your consent."}`,
				actionId,
			);
			notifySuccess(`✅ ${label} complete`);
		};
		window.addEventListener("banking-agent-hitl-confirmed", onConfirmed);
		return () =>
			window.removeEventListener("banking-agent-hitl-confirmed", onConfirmed);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Persist open state so the panel survives a page refresh
	const hasMountedRef = useRef(false);
	useEffect(() => {
		if (isInline) return;
		try {
			localStorage.setItem("banking-agent-open", String(isOpen));
		} catch {}
	}, [isOpen, isInline]);

	// Floating mode: follow **route changes** only — default collapsed on dashboard homes, open on tool routes.
	// Do not tie this to user/session (see REGRESSION_LOG — auth sync was resetting isOpen and closing the panel).
	useEffect(() => {
		if (isInline) return;
		if (!hasMountedRef.current) {
			hasMountedRef.current = true;
			return; // skip initial mount — let localStorage-restored value stand
		}
		setIsOpen(isBankingAgentFloatingDefaultOpen(location.pathname));
	}, [location.pathname, isInline]);

	// Auto-open when returning from /config (Config.js navigates back with scrollToAgent:true)
	// Also handles Agent nav button redirect (state.openAgent)
	useEffect(() => {
		if (location.state?.scrollToAgent || location.state?.openAgent) {
			setIsOpen(true);
			window.history.replaceState({}, "");
		}
	}, [location.state]);

	// Open floating panel when 'banking-agent-open' event is dispatched (e.g. nav Agent button)
	useEffect(() => {
		if (isInline) return;
		const handler = () => setIsOpen(true);
		window.addEventListener("banking-agent-open", handler);
		return () => window.removeEventListener("banking-agent-open", handler);
	}, [isInline]);

	// Auto-open when redirected back from OAuth login (?oauth=success in URL)
	useEffect(() => {
		if (searchParams.get("oauth") === "success") {
			let pendingNl = null;
			try {
				pendingNl = sessionStorage.getItem(BX_AGENT_PENDING_NL_KEY);
			} catch (_) {}

			setIsOpen(true);
			// Strip oauth params from URL so they don't re-trigger on navigation
			const url = new URL(window.location.href);
			url.searchParams.delete("oauth");
			url.searchParams.delete("stepup");
			window.history.replaceState({}, "", url.toString());

			// Auth cookie is set on the callback response, but on Vercel the status
			// check may land on a cold instance before Redis propagates.  Retry with
			// increasing backoff (immediate, 600, 1400, 2500 ms).
			const retryDelays = [0, 600, 1400, 2500];
			const timers = [];
			retryDelays.forEach((delay, i) => {
				const t = setTimeout(async () => {
					const result = await Promise.all([
						getCachedStatus("/api/auth/oauth/status").catch(() => null),
						getCachedStatus("/api/auth/oauth/user/status").catch(() => null),
						getCachedStatus("/api/auth/session").catch(() => null),
					]);
					const [admin, endUser, session] = result;
					const { found, cookieOnlyBffSession: cookieOnly } =
						resolveSessionFromAuthTrio(admin, endUser, session);
					if (found) {
						setCookieOnlyBffSession(cookieOnly);
						setSessionUser(found);
						if (pendingNl && String(pendingNl).trim()) {
							try {
								sessionStorage.removeItem(BX_AGENT_PENDING_NL_KEY);
							} catch (_) {}
							setNlResumeAfterAuth(String(pendingNl).trim());
						}
						setMessages((prev) => {
							if (prev.length > 0) return prev;
							const welcome = {
								id: `${Date.now()}-w`,
								role: "assistant",
								content: welcomeMessage(found, embeddedFocus, brandShortName, industryPreset.id),
							};
							if (cookieOnly) {
								sessionFixBubbleShownRef.current = true;
								return [
									welcome,
									{
										id: `${Date.now()}-fix`,
										role: "error",
										content: buildSessionNotHydratedChat(
											session?.sessionStoreError ?? null,
											session?.sessionStoreHealthy ?? null,
										),
										showSessionFixActions: true,
									},
								];
							}
							return [welcome];
						});
						// Notify App.js once so it can navigate to dashboard routes
						if (i === 0)
							window.dispatchEvent(new CustomEvent("userAuthenticated"));
						// Cancel remaining retries
						timers.forEach(clearTimeout);
					}
				}, delay);
				timers.push(t);
			});
			return () => timers.forEach(clearTimeout);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [searchParams]);

	// Auto-open when the user prop transitions from null → authenticated user
	// (fires on initial mount when App.js has already resolved the session,
	//  and again if the user changes while the component is mounted)
	useEffect(() => {
		if (!user) return;
		setMessages((prev) =>
			prev.length === 0
				? [
						{
							id: Date.now().toString(),
							role: "assistant",
							content: welcomeMessage(user, embeddedFocus, brandShortName, industryPreset.id),
						},
					]
				: prev,
		);
	}, [user, embeddedFocus, brandShortName]);

	// Effective user: prefer prop (App.js state), fall back to self-detected session
	const effectiveUser = user || sessionUser;
	const isLoggedIn = !!effectiveUser;
	/** Marketing `/` guests may chat (education / hints); banking triggers PingOne + return here. */
	const marketingGuestChatEnabled = useMemo(() => {
		const p = (location.pathname || "").replace(/\/$/, "") || "/";
		return !isLoggedIn && isPublicMarketingAgentPath(p);
	}, [isLoggedIn, location.pathname]);
	const isConfigured = oauthConfig && (oauthConfig.admin || oauthConfig.user);

	// Fetch real account IDs from the server whenever the user is known.
	// Stored in liveAccounts and passed to ActionForm so the balance/deposit/withdraw/transfer
	// dropdowns always send the ID the server actually has (prevents '❌ Account chk-5 not found').
	useEffect(() => {
		if (!isLoggedIn) return;
		let cancelled = false;
		fetch("/api/accounts/my", { credentials: "include", _silent: true })
			.then((r) => (r.ok ? r.json() : null))
			.then((data) => {
				if (cancelled || !data?.accounts?.length) return;
				setLiveAccounts(
					data.accounts.map((a) => ({
						id: a.id,
						name:
							a.name ||
							(a.accountType === "savings"
								? "Savings Account"
								: "Checking Account"),
						type: a.accountType || a.account_type || "checking",
						balance: a.balance || 0,
						accountNumber: a.accountNumber || a.account_number || a.id,
					})),
				);
			})
			.catch(() => {
				/* silent — ActionForm falls back to generateFakeAccounts */
			});
		return () => {
			cancelled = true;
		};
	}, [isLoggedIn]);

	const suggestionList = useMemo(() => {
		if (isConfigEmbeddedFocus) {
			return effectiveUser?.role === "admin"
				? SUGGESTIONS_CONFIG_ADMIN
				: SUGGESTIONS_CONFIG_CUSTOMER;
		}
		return effectiveUser?.role === "admin"
			? SUGGESTIONS_ADMIN
			: SUGGESTIONS_CUSTOMER;
	}, [isConfigEmbeddedFocus, effectiveUser?.role]);

	/**
	 * Independently check auth endpoints.  Called on mount, on panel open, and
	 * when the 'userAuthenticated' event fires (App.js dispatches this after login).
	 * Checks all three session types: admin OAuth, end-user OAuth, and basic auth.
	 * Does NOT dispatch userAuthenticated — that caused an infinite loop with App.js
	 * (App listens → checkOAuthSession → agent listener → checkSelfAuth → dispatch → …).
	 * Mount / OAuth-retry paths dispatch once when they first discover a session.
	 */
	const checkSelfAuth = useCallback(() => {
		Promise.all([
			getCachedStatus("/api/auth/oauth/status").catch(() => null),
			getCachedStatus("/api/auth/oauth/user/status").catch(() => null),
			getCachedStatus("/api/auth/session").catch(() => null),
		]).then(([admin, endUser, session]) => {
			const { found, cookieOnlyBffSession: cookieOnly } =
				resolveSessionFromAuthTrio(admin, endUser, session);
			setCookieOnlyBffSession(cookieOnly);
			if (found) {
				setSessionUser(found);
				// Clear any stale consent-decline block — user has a fresh session.
				setAgentBlockedByConsentDecline(false);
			}
		});
	}, []);

	// P1 — When the BFF returns cookieOnlyBffSession:true, poll /api/auth/session
	// every 2s for up to 10s. Once the Upstash write has propagated (cookieOnlyBffSession
	// becomes false) clear the banner and let normal interaction resume.
	useEffect(() => {
		if (!cookieOnlyBffSession) {
			setSessionReconnecting(false);
			return;
		}
		setSessionReconnecting(true);
		let attempts = 0;
		const MAX_ATTEMPTS = 5; // 5 × 2s = 10s
		const interval = setInterval(async () => {
			attempts += 1;
			try {
				const r = await fetch("/api/auth/session", {
					credentials: "include",
					_silent: true,
				});
				if (r.ok) {
					const data = await r.json();
					if (!data.cookieOnlyBffSession) {
						setCookieOnlyBffSession(false);
						setSessionReconnecting(false);
						clearInterval(interval);
						return;
					}
				}
			} catch (_) {
				/* non-fatal */
			}
			if (attempts >= MAX_ATTEMPTS) {
				setSessionReconnecting(false);
				clearInterval(interval);
			}
		}, 2000);
		return () => clearInterval(interval);
	}, [cookieOnlyBffSession]);

	/** RFC 6749 refresh — does not log out; retries server-side session tokens. */
	const handleSessionRefresh = useCallback(async () => {
		setSessionRefreshing(true);
		try {
			const r = await refreshOAuthSession();
			if (r.ok) {
				notifySuccess("Access token refreshed. You can retry your action.");
				checkSelfAuth();
			} else {
				notifyError(
					"Could not refresh — use Sign in again or reload the page.",
				);
			}
		} catch (e) {
			notifyError(e?.message || "Refresh failed");
		} finally {
			setSessionRefreshing(false);
		}
	}, [checkSelfAuth]);

	// Check on mount — auto-open if already authenticated (e.g. page refresh after login)
	useEffect(() => {
		Promise.all([
			getCachedStatus("/api/auth/oauth/status").catch(() => null),
			getCachedStatus("/api/auth/oauth/user/status").catch(() => null),
			getCachedStatus("/api/auth/session").catch(() => null),
		]).then(([admin, endUser, session]) => {
			const { found, cookieOnlyBffSession: cookieOnly } =
				resolveSessionFromAuthTrio(admin, endUser, session);
			setCookieOnlyBffSession(cookieOnly);
			if (found) {
				setSessionUser(found);
				// Clear any stale consent-decline block from previous sessions.
				setAgentBlockedByConsentDecline(false);
				const welcome = {
					id: `${Date.now()}-w`,
					role: "assistant",
					content: welcomeMessage(found, embeddedFocus, brandShortName, industryPreset.id),
				};
				if (cookieOnly) {
					sessionFixBubbleShownRef.current = true;
					setMessages([
						welcome,
						{
							id: `${Date.now()}-fix`,
							role: "error",
							content: buildSessionNotHydratedChat(
								session?.sessionStoreError ?? null,
								session?.sessionStoreHealthy ?? null,
							),
							showSessionFixActions: true,
						},
					]);
				} else {
					setMessages([welcome]);
				}
			}
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isInline, embeddedFocus]);

	// Re-check when App.js confirms a login, and auto-open the agent
	useEffect(() => {
		const onAuth = () => {
			checkSelfAuth();
			setMessages((prev) =>
				prev.length === 0
					? [
							{
								id: Date.now().toString(),
								role: "assistant",
								content: welcomeMessage(
									user || sessionUserRef.current,
									embeddedFocus,
									brandShortName,
									industryPreset.id,
								),
							},
						]
					: prev,
			);
		};
		window.addEventListener("userAuthenticated", onAuth);
		return () => window.removeEventListener("userAuthenticated", onAuth);
	}, [checkSelfAuth, user, isInline, embeddedFocus, brandShortName]);

	// Auto-retry after CIBA step-up approval
	useEffect(() => {
		const onStepUpApproved = () => {
			agentFlowDiagram.completeMfaChallenge(true);
			if (!pendingStepUpActionRef.current) return;
			const { actionId, form, method } = pendingStepUpActionRef.current;
			pendingStepUpActionRef.current = null;
			const methodLabel = method === "ciba" ? "CIBA" : "Email OTP";
			const ts = new Date().toLocaleTimeString([], {
				hour: "2-digit",
				minute: "2-digit",
				second: "2-digit",
			});
			addMessage(
				"assistant",
				`✅ ${methodLabel} approved — continuing your request (${ts})`,
				actionId,
			);
			runAction(actionId, form);
		};
		const onStepUpCancelled = () =>
			agentFlowDiagram.completeMfaChallenge(false);
		window.addEventListener("cibaStepUpApproved", onStepUpApproved);
		window.addEventListener("cibaStepUpCancelled", onStepUpCancelled);
		return () => {
			window.removeEventListener("cibaStepUpApproved", onStepUpApproved);
			window.removeEventListener("cibaStepUpCancelled", onStepUpCancelled);
		};
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	// Auto-retry after login (auth challenge path)
	useEffect(() => {
		const onAuthChallengeLogin = () => {
			if (!pendingAuthChallengeActionRef.current) return;
			const { actionId, form } = pendingAuthChallengeActionRef.current;
			pendingAuthChallengeActionRef.current = null;
			try {
				sessionStorage.removeItem("_agent_pending_auth_action");
			} catch {
				/* best-effort */
			}
			addMessage(
				"assistant",
				"✅ Signed in — retrying your request…",
				actionId,
			);
			runAction(actionId, form);
		};
		window.addEventListener("userAuthenticated", onAuthChallengeLogin);
		return () =>
			window.removeEventListener("userAuthenticated", onAuthChallengeLogin);
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	// Re-check when panel opens (catches sessions established after mount)
	useEffect(() => {
		if (isOpen) checkSelfAuth();
	}, [isOpen, checkSelfAuth]);

	// Mutual exclusion: close agent when an education panel opens
	useEffect(() => {
		if (edu?.panel) setIsOpen(false);
	}, [edu?.panel]); // eslint-disable-line react-hooks/exhaustive-deps

	// Mutual exclusion: close any open education panel when agent opens.
	// Deps intentionally omit edu?.panel — if edu.panel is included, this effect fires when
	// the user opens an edu panel (edu.panel null→set), sees isOpen=true (stale render snapshot),
	// and immediately calls edu.close(), killing the panel before it renders.
	useEffect(() => {
		if (isOpen && edu?.panel) edu.close();
	}, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

	// Check config status from IndexedDB cache whenever panel opens
	useEffect(() => {
		if (isOpen && !isLoggedIn) {
			loadPublicConfig()
				.then((cfg) => {
					const env = !!cfg.pingone_environment_id;
					setOauthConfig({
						admin: env && !!cfg.admin_client_id,
						user: env && !!cfg.user_client_id,
					});
				})
				.catch(() => setOauthConfig({ admin: false, user: false }));
		}
	}, [isOpen, isLoggedIn]);

	useEffect(() => {
		if (!isOpen) return;
		const el = messagesContainerRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [messages, isOpen]);

	useEffect(() => {
		if (!isOpen) return;
		if (!isLoggedIn && !marketingGuestChatEnabled) return;
		fetchNlStatus()
			.then(setNlMeta)
			.catch(() => setNlMeta({ geminiConfigured: false }));
	}, [isOpen, isLoggedIn, marketingGuestChatEnabled]);

	// Keep MCP status lightweight here to avoid auth/noise calls while browsing dashboards.
	useEffect(() => {
		if (!isOpen || !isLoggedIn) return;
		setMcpStatus({ toolCount: ACTIONS.length, connected: true });
	}, [isOpen, isLoggedIn]);

	// ── Drag-to-move ──────────────────────────────────────────────────────────
	// Uses pointer capture so dragging continues off-screen onto a second monitor.
	const handleDragStart = useCallback((e) => {
		// Don't intercept button/input clicks
		if (e.target.closest("button, input, textarea, select")) return;
		const rect = panelRef.current?.getBoundingClientRect();
		if (!rect) return;
		isDraggingRef.current = true;
		dragOffsetRef.current = {
			x: e.clientX - rect.left,
			y: e.clientY - rect.top,
		};
		// Always anchor to current visual position and exit expanded mode so panelStyle
		// uses the drag coordinates (isExpanded causes the centered style to win otherwise)
		setIsExpanded(false);
		setDragPos({ x: rect.left, y: rect.top });
		e.preventDefault();
		document.body.style.userSelect = "none";

		// Capture pointer on the panel so events keep firing even off-browser-window
		const target = panelRef.current || e.currentTarget;
		try {
			target.setPointerCapture(e.pointerId);
		} catch (_) {
			/* noop if not pointer event */
		}

		function onMove(ev) {
			if (!isDraggingRef.current) return;
			// No clamping — allow drag to second screen
			const x = ev.clientX - dragOffsetRef.current.x;
			const y = ev.clientY - dragOffsetRef.current.y;
			setDragPos({ x, y });
		}
		function onUp() {
			isDraggingRef.current = false;
			document.body.style.userSelect = "";
			target.removeEventListener("pointermove", onMove);
			target.removeEventListener("pointerup", onUp);
			target.removeEventListener("pointercancel", onUp);
		}
		target.addEventListener("pointermove", onMove);
		target.addEventListener("pointerup", onUp);
		target.addEventListener("pointercancel", onUp);
	}, []);

	// (drag listeners now attached inline in handleDragStart via pointer capture)
	useEffect(() => {
		/* no-op — kept for hook ordering stability */
	}, []);

	// Resize handler — works whether the panel is at CSS default position or has been dragged.
	// Supports all 8 directions: n, ne, e, se, s, sw, w, nw.
	// N/W/NW/NE/SW directions shift dragPos so the opposite edge stays fixed.
	const handleResize = useCallback(
		(e, direction) => {
			e.preventDefault();
			e.stopPropagation();
			const startX = e.clientX;
			const startY = e.clientY;
			const startWidth = panelSize.width;
			const startHeight = panelSize.height;

			// Exit expanded mode on resize (same as drag)
			setIsExpanded(false);

			// Capture starting position from current dragPos or from getBoundingClientRect.
			// Must be done synchronously so onMove calculations are anchored correctly.
			let startPosX, startPosY;
			const rect = panelRef.current?.getBoundingClientRect();
			if (dragPos) {
				startPosX = dragPos.x;
				startPosY = dragPos.y;
			} else if (rect) {
				startPosX = rect.left;
				startPosY = rect.top;
				setDragPos({ x: rect.left, y: rect.top });
			} else {
				startPosX = 0;
				startPosY = 0;
			}

			function onMove(ev) {
				const deltaX = ev.clientX - startX;
				const deltaY = ev.clientY - startY;
				const MIN_W = 280,
					MIN_H = 220;
				const MAX_W = Math.floor(window.innerWidth * 0.95);
				const MAX_H = Math.floor(window.innerHeight * 0.95);

				let newWidth = startWidth;
				let newHeight = startHeight;
				let newX = startPosX;
				let newY = startPosY;

				// Right edge — grows rightward, position unchanged
				if (direction === "e" || direction === "se" || direction === "ne") {
					newWidth = Math.min(MAX_W, Math.max(MIN_W, startWidth + deltaX));
				}
				// Left edge — grows leftward, left position shifts
				if (direction === "w" || direction === "sw" || direction === "nw") {
					newWidth = Math.min(MAX_W, Math.max(MIN_W, startWidth - deltaX));
					newX = startPosX + (startWidth - newWidth);
				}
				// Bottom edge — grows downward, position unchanged
				if (direction === "s" || direction === "se" || direction === "sw") {
					newHeight = Math.min(MAX_H, Math.max(MIN_H, startHeight + deltaY));
				}
				// Top edge — grows upward, top position shifts
				if (direction === "n" || direction === "ne" || direction === "nw") {
					newHeight = Math.min(MAX_H, Math.max(MIN_H, startHeight - deltaY));
					newY = startPosY + (startHeight - newHeight);
				}

				setPanelSize({ width: newWidth, height: newHeight });
				setDragPos({ x: newX, y: newY });
			}

			function onUp() {
				document.removeEventListener("mousemove", onMove);
				document.removeEventListener("mouseup", onUp);
			}

			document.addEventListener("mousemove", onMove);
			document.addEventListener("mouseup", onUp);
			// eslint-disable-next-line react-hooks/exhaustive-deps
		},
		[panelSize, dragPos],
	);

	// Panel position: override CSS anchoring when user has dragged the window
	// In inline mode the CSS (.ba-mode-inline) handles size — no inline style needed
	const panelStyle = isInline
		? {}
		: isExpanded
			? {
					left: "50%",
					top: "50%",
					transform: "translate(-50%, -50%)",
					width: "min(94vw, 520px)",
					height: "min(85vh, 720px)",
					maxWidth: 560,
					maxHeight: "85vh",
					right: "auto",
					bottom: "auto",
				}
			: dragPos
				? {
						left: dragPos.x,
						top: dragPos.y,
						bottom: "auto",
						right: "auto",
						width: panelSize.width,
						height: panelSize.height,
						transform: "none",
					}
				: {
						width: panelSize.width,
						height: panelSize.height,
						transform: "none",
					};
	/** Results panel width (CSS) — keep gap in sync when dragging / expanded layout */
	const resultsPanelWidthPx = 340;

	// In inline mode the panel is always visible; in float mode respect the open/closed state
	const effectiveIsOpen = isInline || isOpen;

	// Keep agentBounds fresh whenever the panel resizes (chips expand/collapse, resize handle use)
	useEffect(() => {
		const update = () => {
			const rect = panelRef.current?.getBoundingClientRect();
			if (rect)
				setAgentBounds({
					left: rect.left,
					top: rect.top,
					right: rect.right,
					bottom: rect.bottom,
					width: rect.width,
					height: rect.height,
				});
		};
		const ro =
			typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
		if (ro && panelRef.current) ro.observe(panelRef.current);
		update();
		return () => ro?.disconnect();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [effectiveIsOpen, panelSize, isExpanded]);

	// Also update bounds on drag (ResizeObserver fires only on size changes, not position)
	useEffect(() => {
		const rect = panelRef.current?.getBoundingClientRect();
		if (rect)
			setAgentBounds({
				left: rect.left,
				top: rect.top,
				right: rect.right,
				bottom: rect.bottom,
				width: rect.width,
				height: rect.height,
			});
	}, [dragPos]);

	const resultsPanelStyle = useMemo(() => {
		const gap = 12;
		const rpW = resultsPanelWidthPx;
		// Anchor to actual agent panel bounds when available — works for all modes (inline, drag, expanded, default)
		if (agentBounds) {
			const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
			const topEdge = Math.max(8, agentBounds.top);
			const maxH = Math.min(
				(typeof window !== "undefined" ? window.innerHeight : 800) -
					topEdge -
					16,
				520,
			);
			// Place the results panel to the LEFT of the agent, pushed right if it would overflow
			const desiredLeft = Math.max(8, agentBounds.left - rpW - gap);
			return {
				position: "fixed",
				left: Math.min(desiredLeft, vw - rpW - 8),
				top: topEdge,
				bottom: "auto",
				right: "auto",
				maxHeight: maxH,
				zIndex: 10058,
			};
		}
		// Fallbacks when bounds not yet measured
		if (isInline) {
			// Try to read panel bounds synchronously from the ref (avoids CSS flash at wrong position)
			const rect = panelRef.current?.getBoundingClientRect();
			if (rect) {
				const topEdge = Math.max(8, rect.top);
				const maxH = Math.min(window.innerHeight - topEdge - 16, 520);
				const desiredLeft = Math.max(8, rect.left - rpW - gap);
				return {
					position: "fixed",
					left: Math.min(desiredLeft, window.innerWidth - rpW - 8),
					top: topEdge,
					bottom: "auto",
					right: "auto",
					maxHeight: maxH,
					zIndex: 10058,
				};
			}
			// Ref not yet mounted — use off-screen coords to prevent CSS flash at wrong edge
			return { position: "fixed", left: -9999, top: -9999, zIndex: -1 };
		}
		if (dragPos) {
			return {
				position: "fixed",
				left: Math.max(8, dragPos.x - rpW - gap),
				top: dragPos.y,
				bottom: "auto",
				right: "auto",
				zIndex: 10058,
			};
		}
		if (isExpanded) {
			return {
				position: "fixed",
				left: `max(8px, calc(50vw - min(94vw, 520px) / 2 - ${gap}px - ${rpW}px))`,
				top: "50vh",
				transform: "translateY(-50%)",
				bottom: "auto",
				right: "auto",
				zIndex: 10058,
			};
		}
		return undefined;
	}, [dragPos, isExpanded, isInline, resultsPanelWidthPx, agentBounds]);

	function addMessage(role, content, tool, extra = {}) {
		const { id: exId, ...rest } = extra;
		const id = exId || `${Date.now()}`;
		// Ensure content is always a string for React rendering
		const contentString =
			typeof content === "string" ? content : JSON.stringify(content);
		setMessages((prev) => [
			...prev,
			{ id, role, content: contentString ?? "", tool, ...rest },
		]);
	}

	function markToolProgressOutcome(success) {
		const tid = toolProgressIdRef.current;
		if (!tid) return;
		toolProgressIdRef.current = null;
		setMessages((prev) =>
			prev.map((m) =>
				m.id === tid && m.role === "tool-progress"
					? {
							...m,
							steps: (m.steps || []).map((s) => ({
								...s,
								status: success ? "success" : "error",
							})),
						}
					: m,
			),
		);
	}

	/** Show overlay then redirect to PingOne login. */
	async function handleLoginAction(actionId) {
		const label = actionId === "login_admin" ? "Admin" : "Customer";
		spinner.show(`Signing in as ${label}…`, "Redirecting to PingOne");
		// Save any pending prompt so it can be re-executed after OAuth return.
		// nlInput holds the current typed/pre-filled text; capture it before navigation.
		try {
			const pendingText = (nlInput || "").trim();
			if (pendingText) {
				sessionStorage.setItem(BX_AGENT_PENDING_NL_KEY, pendingText);
			}
		} catch (_) {}
		const apiUrl = process.env.REACT_APP_API_URL || window.location.origin;
		if (actionId === "login_admin") {
			setTimeout(() => {
				window.location.href = `${apiUrl}/api/auth/oauth/login`;
			}, 150);
			return;
		}
		if (actionId === "login_user") {
			let usePiFlow = false;
			try {
				const r = await fetch("/api/admin/config", { credentials: "include" });
				const j = await r.json();
				const cfg = j?.config || {};
				if (cfg.marketing_customer_login_mode === "slide_pi_flow")
					usePiFlow = true;
			} catch (_) {
				/* keep default redirect */
			}
			setTimeout(() => {
				const p = (location.pathname || "").replace(/\/$/, "") || "/";
				const params = new URLSearchParams();
				if (isPublicMarketingAgentPath(p))
					params.set("return_to", p === "/dashboard" ? "/dashboard" : "/");
				if (usePiFlow) params.set("use_pi_flow", "1");
				const q = params.toString();
				window.location.href = `${apiUrl}/api/auth/oauth/user/login${q ? `?${q}` : ""}`;
			}, 150);
			return;
		}
		// Default behavior for other action IDs
		let usePiFlow = false;
		try {
			const r = await fetch("/api/admin/config", { credentials: "include" });
			const j = await r.json();
			const cfg = j?.config || {};
			if (cfg.marketing_customer_login_mode === "slide_pi_flow")
				usePiFlow = true;
		} catch (_) {
			/* keep default redirect */
		}
		setTimeout(() => {
			const p = (location.pathname || "").replace(/\/$/, "") || "/";
			const params = new URLSearchParams();
			if (isPublicMarketingAgentPath(p))
				params.set("return_to", p === "/dashboard" ? "/dashboard" : "/");
			if (usePiFlow) params.set("use_pi_flow", "1");
			const q = params.toString();
			window.location.href = `${apiUrl}/api/auth/oauth/user/login${q ? `?${q}` : ""}`;
		}, 150);
	}

	/**
	 * Runs a banking tool. When fromNl is true, skips the extra user bubble (NL already echoed the ask).
	 */
	async function runAction(actionId, form, opts = {}) {
		if (isAgentBlockedByConsentDecline()) {
			addMessage("assistant", AGENT_CONSENT_BLOCK_USER_MESSAGE);
			return;
		}
		// Layer-zero auth gate: require a logged-in session before any banking action
		if (!isLoggedIn) {
			addMessage(
				"assistant",
				"🔐 You need to sign in first to perform banking operations. Tap **Customer Sign In** in the left panel to get started.",
			);
			return;
		}
		const { skipUserLabel = false } = opts;
		setActiveAction(null);
		const label = ACTIONS.find((a) => a.id === actionId)?.label || actionId;
		if (!skipUserLabel) {
			addMessage("user", label);
		}
		setLoading(true);
		postAppEvent('agent', 'info', 'Agent processing started', { tag: 'agent/processing-start', metadata: { userId: effectiveUser?.id || effectiveUser?.username } });

		// Toast: show in-progress indicator
		const toastId = `agent-${actionId}-${Date.now()}`;
		toast.info(`⚙️ ${label}…`, { toastId, autoClose: false, isLoading: true });

		try {
			const stepDefs = getToolStepsForAction(actionId);
			if (stepDefs.length > 0) {
				const tid = `tp-${Date.now()}`;
				toolProgressIdRef.current = tid;
				addMessage("tool-progress", "", null, {
					id: tid,
					steps: stepDefs.map((s) => ({ ...s, status: "running" })),
				});
			}

			let response;
			switch (actionId) {
				case "accounts":
					toast.update(toastId, { render: "🔍 Calling get_my_accounts…" });
					response = await getMyAccounts();
					break;
				case "transactions":
					toast.update(toastId, { render: "🔍 Calling get_my_transactions…" });
					response = await getMyTransactions();
					break;
				case "balance":
					toast.update(toastId, { render: "🔍 Calling get_account_balance…" });
					response = await getAccountBalance(form.accountId);
					break;
				case "deposit":
					toast.update(toastId, { render: "⬇️ Calling create_deposit…" });
					response = await createDeposit(
						form.accountId || form.toId,
						parseFloat(form.amount),
						form.note,
					);
					break;
				case "withdraw":
					toast.update(toastId, { render: "⬆️ Calling create_withdrawal…" });
					response = await createWithdrawal(
						form.accountId || form.fromId,
						parseFloat(form.amount),
						form.note,
					);
					break;
				case "transfer":
					toast.update(toastId, { render: "↔️ Calling create_transfer…" });
					response = await createTransfer(
						form.fromId,
						form.toId,
						parseFloat(form.amount),
						form.note,
					);
					break;
				case "sensitive-account-details": {
					// Gate behind HITL — show consent card first, fetch data only after user confirms.
					addMessage(
						"assistant",
						"🔒 **Sensitive Account Data Request**\n\nThis will reveal your **full account numbers, routing numbers, SWIFT, and IBAN**. Please confirm before proceeding.",
						actionId,
					);
					toast.dismiss(toastId);
					setLoading(false);
					toolProgressIdRef.current = null;
					setHitlPendingIntent({
						actionId: "sensitive-account-details",
						form,
						intentPayload: {
							type: "Sensitive Data Access",
							description:
								"Full account numbers · Routing numbers · SWIFT / IBAN",
							amount: 0,
						},
						threshold: 1, // 0 < 1 → not flagged as high-value
						isSensitiveData: true,
					});
					return;
				}
				case "mcp_tools": {
					toast.update(toastId, { render: "🔧 Fetching MCP tool list…" });
					agentFlowDiagram.startInspectorToolsList();
					let mcpRes;
					try {
						mcpRes = await fetch("/api/mcp/inspector/tools", {
							credentials: "include",
						});
					} catch (netErr) {
						agentFlowDiagram.completeInspectorToolsList({
							ok: false,
							errorMessage: netErr.message || "Network error",
						});
						throw netErr;
					}
					if (!mcpRes.ok) {
						agentFlowDiagram.completeInspectorToolsList({
							ok: false,
							errorMessage: `HTTP ${mcpRes.status}`,
						});
						throw new Error(`MCP tools fetch failed: ${mcpRes.status}`);
					}
					let data;
					try {
						data = await mcpRes.json();
					} catch (parseErr) {
						agentFlowDiagram.completeInspectorToolsList({
							ok: false,
							errorMessage: parseErr.message || "Invalid JSON",
						});
						throw parseErr;
					}
					// MFA gate: server requires step-up before listing tools.
					if (data.mfa_required) {
						agentFlowDiagram.completeInspectorToolsList({
							ok: false,
							errorMessage: "mfa_required",
						});
						toast.update(toastId, {
							render:
								"🔐 MFA verification required to load tools — verify your identity below",
							type: "warning",
							isLoading: false,
							autoClose: 6000,
						});
						setLoading(false);
						toolProgressIdRef.current = null;
						window.dispatchEvent(
							new CustomEvent("agentStepUpRequested", {
								detail: { step_up_method: data.step_up_method || "email" },
							}),
						);
						return;
					}
					const tools = data.tools || [];
					agentFlowDiagram.completeInspectorToolsList({
						ok: true,
						source: data._source || "mcp_server",
					});
					// Show tools in modal instead of chat message
					setMcpToolsList(tools);
					setShowMcpToolsModal(true);
					addMessage(
						"assistant",
						`🔧 MCP Banking Tools (${tools.length} available) — check the popup window`,
						"tools/list",
					);
					toast.update(toastId, {
						render: `✅ ${tools.length} tools loaded`,
						type: "success",
						isLoading: false,
						autoClose: agentToastMs.toolsLoaded,
					});
					setLoading(false);
					toolProgressIdRef.current = null;
					return;
				}
				case "web_search": {
					toast.update(toastId, { render: "\u{1F50D} Searching the web…" });
					const q = encodeURIComponent(form.query || "");
					let srRes;
					try {
						srRes = await fetch(`/api/banking-agent/search?q=${q}`, {
							credentials: "include",
						});
					} catch (netErr) {
						throw new Error(`Web search network error: ${netErr.message}`);
					}
					const srData = await srRes.json().catch(() => ({}));
					if (!srRes.ok) {
						if (srData.error === "BRAVE_NOT_CONFIGURED") {
							addMessage(
								"assistant",
								`\u26A0\uFE0F Web search is not configured.\n\n${srData.message || "Set BRAVE_SEARCH_API_KEY in the server environment to enable web search."}`,
								actionId,
							);
							toast.dismiss(toastId);
							setLoading(false);
							toolProgressIdRef.current = null;
							return;
						}
						throw new Error(srData.message || `Search failed: ${srRes.status}`);
					}
					const srResults = (srData.results || [])
						.map(
							(r, i) =>
								`${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.description || ""}`,
						)
						.join("\n\n");
					addMessage(
						"assistant",
						`\u{1F50D} Web search results for **"${srData.query || form.query || ""}"**:\n\n${srResults || "No results found."}`,
						actionId,
					);
					toast.update(toastId, {
						render: "\u2705 Search complete",
						type: "success",
						isLoading: false,
						autoClose: agentToastMs.toolsLoaded,
					});
					setLoading(false);
					toolProgressIdRef.current = null;
					return;
				}
				// ── Testing scenarios ──────────────────────────────────────────────────
				case "test_wrong_scope": {
					// Calls a real MCP tool that requires a scope the agent policy blocks, exercising the
					// server-side scope gate. Uses `admin_get_all_users` which requires an admin-only scope
					// not present in end-user tokens. Outcome is verified from the server response code.
					// RFC 6749 §3.3 — access tokens carry a scope claim; resource servers MUST reject requests
					// for scopes not granted at authorization time.
					toast.update(toastId, {
						render: "⚠️ Calling MCP tool with blocked scope…",
					});
					let scopeTestRes;
					try {
						scopeTestRes = await callMcpTool("admin_get_all_users", {});
					} catch (scopeErr) {
						scopeTestRes = {
							error: scopeErr.code || scopeErr.message,
							tokenEvents: scopeErr.tokenEvents || [],
						};
					}
					const scopeRejected =
						scopeTestRes?.error === "agent_mcp_scope_denied" ||
						scopeTestRes?.error?.includes("scope");
					const scopeOutcome = scopeRejected
						? `✅ Server correctly rejected the request: \`${scopeTestRes.error}\`\n   Missing scopes: \`${(scopeTestRes.missingScopes || []).join(", ") || "agent policy check"}\``
						: `ℹ️ Server response: ${scopeTestRes?.error || JSON.stringify(scopeTestRes?.result || {}).slice(0, 120)}`;
					addMessage(
						"token-event",
						[
							"⚠️ **Authorization Test: Insufficient Scope (RFC 6749 §3.3)**",
							"",
							scopeOutcome,
							"",
							"**RFC 6749 §3.3** — The `scope` parameter limits what an access token can do.",
							"   Resource servers MUST reject requests where the token does not carry the required scope.",
							"**RFC 8693 §2.1** — The RFC 8693 exchange can only narrow (not expand) scopes from the subject token.",
							"   An MCP token cannot gain scopes the user's login token did not include.",
							"",
							"Open **Token Chain** ↗ to inspect the `scope` claim on the user and MCP tokens.",
						].join("\n"),
						actionId,
					);
					if (scopeTestRes?.tokenEvents?.length) {
						tokenChain?.setTokenEvents(actionId, scopeTestRes.tokenEvents);
					}
					toast.update(toastId, {
						render: scopeRejected
							? "✅ Scope rejection confirmed"
							: "ℹ️ Scope test sent",
						type: "info",
						isLoading: false,
						autoClose: agentToastMs.toolsLoaded,
					});
					setLoading(false);
					toolProgressIdRef.current = null;
					return;
				}
				case "test_wrong_audience": {
					// Calls the MCP tool endpoint with a deliberately wrong audience value in the
					// exchange request by temporarily disabling mcp_resource_uri and requesting a
					// non-existent audience. The RFC 8693 exchange will fail with an audience error.
					// RFC 8693 §2.1 + RFC 8707 — token exchange requires the `audience` to match a
					// resource server the AS is authorised to issue for.
					toast.update(toastId, {
						render: "⚠️ Testing wrong audience on MCP token exchange…",
					});
					let audTestRes;
					try {
						// Request a tool whose exchange will target a nonsense audience
						const apiBase = process.env.REACT_APP_API_URL || "";
						const r = await fetch(`${apiBase}/api/mcp/tool`, {
							method: "POST",
							credentials: "include",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({
								tool: "get_my_accounts",
								params: {},
								_testAudience: "https://invalid-audience.example.com",
							}),
						});
						audTestRes = await r.json();
						audTestRes._httpStatus = r.status;
					} catch (audErr) {
						audTestRes = { error: audErr.message };
					}
					// The server may fall back to local handler (200) or reject (4xx); either is educational
					const audFailed =
						audTestRes._httpStatus >= 400 ||
						audTestRes?.error?.includes("audience") ||
						audTestRes?.error?.includes("exchange");
					const audOutcome = audFailed
						? `✅ Exchange rejected for invalid audience (HTTP ${audTestRes._httpStatus}): \`${audTestRes.error || "exchange_failed"}\``
						: `ℹ️ Server fell back to local handler (token exchange skipped or not configured) — HTTP ${audTestRes._httpStatus ?? 200}`;
					addMessage(
						"token-event",
						[
							"⚠️ **Authorization Test: Wrong Audience (RFC 8693 §2.1 · RFC 8707)**",
							"",
							audOutcome,
							"",
							"**RFC 8693 §2.1** — The `audience` parameter in a token exchange request identifies which",
							"   resource server the resulting token is valid for. The AS verifies it against its policy.",
							"**RFC 8707** — Resource Indicators bind access tokens to specific resource URIs.",
							"   A token issued for `banking-api.example.com` MUST be rejected by `mcp-server.example.com`.",
							"   The `aud` claim in the MCP token must exactly match the MCP server's registered audience.",
							"",
							"Open **Token Chain** ↗ → MCP access token → `aud` claim to see the audience after exchange.",
						].join("\n"),
						actionId,
					);
					if (audTestRes?.tokenEvents?.length) {
						tokenChain?.setTokenEvents(actionId, audTestRes.tokenEvents);
					}
					toast.update(toastId, {
						render: audFailed
							? "✅ Audience rejection confirmed"
							: "ℹ️ Audience test sent",
						type: "info",
						isLoading: false,
						autoClose: agentToastMs.toolsLoaded,
					});
					setLoading(false);
					toolProgressIdRef.current = null;
					return;
				}
				case "test_hitl_required": {
					// Routes through the real transfer path with a high-value amount that exceeds the HITL
					// threshold ($500). Uses live account IDs so the transfer lookup succeeds server-side.
					// HITL (Human-in-the-Loop) pauses the agent and requires explicit user consent before
					// the operation proceeds — a key security pattern for agentic AI systems.
					toast.update(toastId, {
						render:
							"🔐 Sending high-value transfer to trigger Human-in-the-Loop (HITL)…",
					});
					const hitlAccounts =
						liveAccounts && liveAccounts.length >= 2 ? liveAccounts : null;
					const hitlFrom =
						hitlAccounts?.find(
							(a) => a.type === "checking" || a.type === "chk",
						) || hitlAccounts?.[0];
					const hitlTo =
						hitlAccounts?.find(
							(a) => a.type === "savings" || a.type === "sav",
						) || hitlAccounts?.[1];
					if (!hitlFrom || !hitlTo) {
						addMessage(
							"assistant",
							[
								"⚠️ **HITL Test: accounts not loaded**",
								"",
								"Need at least 2 accounts (checking + savings) to run this test.",
								"Try clicking **My Accounts** first to load your account list.",
							].join("\n"),
							actionId,
						);
						toast.dismiss(toastId);
						setLoading(false);
						toolProgressIdRef.current = null;
						return;
					}
					addMessage(
						"token-event",
						[
							"🔐 **Human-in-the-Loop (HITL) Test**",
							"",
							`Attempting transfer of **$99,999.99** from ${hitlFrom.name || hitlFrom.type} → ${hitlTo.name || hitlTo.type}`,
							"This exceeds the HITL threshold — the agent will be paused pending your consent.",
							"",
							"**HITL Gate** — High-value agentic transactions require explicit human approval before",
							"   the AI agent can proceed. The agent is paused until you approve or deny in the modal.",
							"**PingOne Authorize** — The consent decision can be enforced via a PingOne Authorize policy,",
							"   making the approval decision auditable and policy-driven (not just a frontend guard).",
						].join("\n"),
						actionId,
					);
					response = await createTransfer(
						hitlFrom.id,
						hitlTo.id,
						99999.99,
						"Test HITL threshold",
					);
					// Falls through to normalizeAgentToolResult — HITL gate fires there and shows consent modal
					break;
				}
				case "test_otp_required": {
					// Triggers the sensitive-account-details flow which requires step-up MFA via RFC 9470.
					// RFC 9470 (OAuth 2.0 Step-Up Authentication Challenge Protocol) defines how resource
					// servers signal that a stronger authentication is required via WWW-Authenticate challenges.
					toast.update(toastId, {
						render: "📱 Triggering step-up authentication (RFC 9470)…",
					});
					const stepUpRes = await sendAgentMessage(
						"Show me my full account details with routing numbers",
					);
					if (stepUpRes.stepUpRequired) {
						addMessage(
							"token-event",
							[
								"📱 **Step-Up Authentication Test (RFC 9470)**",
								"",
								"✅ Step-up challenge correctly triggered.",
								"",
								"**RFC 9470** — OAuth 2.0 Step-Up Authentication Challenge Protocol.",
								"   A resource server can require stronger authentication (higher `acr`) for sensitive operations.",
								"   The server returns a challenge; the client must obtain a new token with the required `acr` value.",
								"**acr claim** — Authentication Context Class Reference. `Multi_Factor` or `MFA` indicates",
								"   the user authenticated with a second factor (OTP, FIDO2, push notification).",
								"",
								"Complete the OTP challenge below — the agent will resume after your identity is verified.",
							].join("\n"),
							actionId,
						);
						toast.update(toastId, {
							render: "📱 Step-up challenge triggered — verify identity below",
							type: "info",
							isLoading: false,
							autoClose: 6000,
						});
						setLoading(false);
						toolProgressIdRef.current = null;
						window.dispatchEvent(
							new CustomEvent("agentStepUpRequested", {
								detail: { step_up_method: stepUpRes.stepUpMethod || "email" },
							}),
						);
						return;
					}
					addMessage(
						"token-event",
						[
							"📱 **Step-Up Authentication Test (RFC 9470)**",
							"",
							stepUpRes.reply ||
								"Step-up not triggered — MFA may already be satisfied for this session.",
							"",
							"**RFC 9470** — Step-up is only triggered when the session `acr` is below the required level.",
							"   If you already authenticated with MFA, the challenge is skipped (acr already satisfied).",
						].join("\n"),
						actionId,
					);
					toast.update(toastId, {
						render: "✅ Step-up test complete",
						type: "info",
						isLoading: false,
						autoClose: agentToastMs.toolsLoaded,
					});
					setLoading(false);
					toolProgressIdRef.current = null;
					return;
				}
				default:
					throw new Error(`Unknown action: ${actionId}`);
			}

			const normalized = normalizeAgentToolResult(response.result);

			if (isAgentToolErrorResult(normalized)) {
				markToolProgressOutcome(false);
				const tokenEventsErr = response.tokenEvents || [];
				if (tokenChain && tokenEventsErr.length > 0) {
					tokenChain.setTokenEvents(actionId, tokenEventsErr);
				}
				const consent =
					normalized.consent_challenge_required === true ||
					normalized.error === "consent_challenge_required";
				if (consent) {
					const intentPayload = buildConsentIntent(actionId, form);
					if (!intentPayload) {
						// Unexpected: consent required but no intent builder for this action.
						addMessage(
							"assistant",
							`⚠️ This action requires consent but the transaction details could not be determined. Please use the dashboard to complete it.`,
							actionId,
						);
						toast.dismiss(toastId);
						setLoading(false);
						return;
					}
					addMessage(
						"assistant",
						`👤 **Human-in-the-Loop (HITL) — your manual approval is required.**\n\nTransactions over $${normalized.hitl_threshold_usd ?? 500} require your consent before the agent can proceed. The agent is paused and cannot continue until you approve or cancel.\n\nReview the authorization popup, then enter the verification code sent to your email.`,
						actionId,
					);
					toast.dismiss(toastId);
					setHitlPendingIntent({
						actionId,
						form,
						intentPayload,
						threshold: normalized.hitl_threshold_usd ?? 500,
					});
				} else if (
					normalized.step_up_required === true ||
					normalized.error === "step_up_required"
				) {
					// Set context for modal
					let contextLine = "Identity verification required";
					if (normalized.step_up_reason) {
						contextLine = normalized.step_up_reason;
					} else if (
						normalized.amount_threshold &&
						normalized.transaction_amount > normalized.amount_threshold
					) {
						const threshold = normalized.amount_threshold;
						contextLine = `Transfer over $${threshold} requires identity verification`;
					} else if (form) {
						contextLine = "This action requires identity verification";
					}

					// Store pending action and show modal
					setOtpContextLine(contextLine);
					pendingOtpActionRef.current = { actionId, form };

					// Check for P1MFA mode
					if (normalized.step_up_method === "p1mfa") {
						try {
							const apiBase = process.env.REACT_APP_API_URL || "";
							const mfaResp = await fetch(`${apiBase}/api/auth/mfa/challenge`, {
								method: "POST",
								credentials: "include",
								headers: { "Content-Type": "application/json" },
							});
							if (!mfaResp.ok)
								throw new Error(`MFA initiation failed: ${mfaResp.status}`);
							const { daId, devices } = await mfaResp.json();
							setP1mfaDaId(daId);
							setP1mfaDevices(devices || []);
							setP1mfaMode(true);
						} catch (err) {
							console.error(
								"[BankingAgent] P1MFA initiation failed, falling back to stub:",
								err,
							);
							setP1mfaMode(false);
						}
					} else {
						setP1mfaMode(false);
					}

					// Determine FIDO vs OTP for standalone FIDO flow
					if (
						normalized.step_up_method === "fido" ||
						(normalized.allow_fido && supportsFido)
					) {
						setStepUpMethod("fido");
					} else {
						setStepUpMethod("otp");
					}

					setShowOtpModal(true);

					// Show waiting message
					addMessage(
						"assistant",
						"🔐 Waiting for MFA verification… Enter the code from your email in the modal above.",
						`mfa-step-${Date.now()}`,
					);
					toast.dismiss(toastId);
					agentFlowDiagram.completeMfaChallenge(null); // Pending
					setLoading(false);
					return;
				} else if (
					normalized.authChallenge &&
					normalized.authChallenge.authorizationUrl
				) {
					const loginUrl =
						(process.env.REACT_APP_API_URL || "") +
						"/api/auth/oauth/user/login";
					pendingAuthChallengeActionRef.current = { actionId, form };
					// Persist to sessionStorage so it survives the PingOne full-page redirect
					try {
						sessionStorage.setItem(
							"_agent_pending_auth_action",
							JSON.stringify({ actionId, form }),
						);
					} catch {
						/* best-effort */
					}
					addMessage(
						"assistant",
						`🔑 **Login required.**\n\nThis operation requires you to be signed in. Click the button below — your request will resume automatically after you authenticate.`,
						actionId,
					);
					addMessage(
						"assistant",
						'<a href="' +
							loginUrl +
							'" style="display:inline-block;margin-top:8px;padding:8px 16px;background:#4f7df3;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">Sign in →</a>',
						actionId,
					);
					toast.dismiss(toastId);
					setLoading(false);
					return;
				} else {
					addMessage("assistant", formatResult(response.result), actionId);
					toast.dismiss(toastId);
					notifyError(
						`❌ ${normalized.message || normalized.error || "Request failed"}`,
						{ autoClose: agentToastMs.errShort },
					);
				}
				setLoading(false);
				return;
			}

			markToolProgressOutcome(true);

			// Push token events to TokenChainContext (updates TokenChainDisplay on dashboard)
			const tokenEvents = response.tokenEvents || [];
			if (tokenChain && tokenEvents.length > 0) {
				tokenChain.setTokenEvents(actionId, tokenEvents);
			}

			// Show inline token event summary in the chat + dedicated toasts
			if (tokenEvents.length > 0) {
				const exchanged = tokenEvents.find(
					(e) =>
						e.id === "exchanged-token" ||
						e.id === "two-ex-final-token" ||
						e.id === "two-ex-exchange1",
				);
				const required = tokenEvents.find((e) => e.id === "exchange-required");
				const badScopes = tokenEvents.find(
					(e) => e.id === "user-scopes-insufficient",
				);
				const failed = tokenEvents.find((e) => e.id === "exchange-failed");
				const userTokEv = tokenEvents.find((e) => e.id === "user-token");

				// Build a detailed may_act status string from the user token event
				const mayActLine = !userTokEv
					? "   ⚠️ user token not decoded"
					: userTokEv.mayActPresent && userTokEv.mayActValid
						? `   ✅ may_act valid — ${userTokEv.mayActDetails || "delegation authorised"}`
						: userTokEv.mayActPresent && !userTokEv.mayActValid
							? `   ❌ may_act mismatch — ${userTokEv.mayActDetails || "client_id does not match BFF"}`
							: "   ⚠️ may_act absent from user token";

				let tokenMsg = null;
				if (exchanged) {
					const actLine = exchanged.actPresent
						? `   ✅ act: ${exchanged.actDetails} — BFF confirmed as current actor`
						: "   ⚠️ act absent — subject-only exchange (no delegation proof in MCP token; set AGENT_OAUTH_CLIENT_ID)";
					const audLine =
						exchanged.audExpected !== undefined
							? exchanged.audMatches
								? `   ✅ aud: "${exchanged.audActual ?? exchanged.audienceNarrowed}" — MCP server audience matched (RFC 8707)`
								: `   ❌ aud mismatch — got "${exchanged.audActual}" expected "${exchanged.audExpected}" — MCP server will reject`
							: `   aud: ${exchanged.audienceNarrowed || "—"} (RFC 8707 resource indicator)`;
					tokenMsg = [
						"🔐 RFC 8693 Token Exchange complete",
						mayActLine,
						actLine,
						audLine,
						`   Scope narrowed: ${exchanged.scopeNarrowed || "—"}`,
						"",
						"Open Token Chain ↗ to inspect decoded claims.",
						"aud (audience): which resource server accepts the token — narrowed on exchange.",
						"may_act (user token) = prospective permission · act (MCP token) = current delegation fact.",
						...(exchanged.actPresent
							? [
									"",
									"🔀 **Delegation chain (RFC 8693 §4 — act claim)**",
									`   act: ${exchanged.actDetails || '{ client_id: "bff" }'}`,
									"   Subject-only exchange = no act claim (token cannot prove which client called it).",
									"   Nested act = full chain: user → AI agent → MCP service, each hop tamper-evident in the token.",
								]
							: []),
					].join("\n");
					notifyInfo(
						`🔐 Token Exchange complete — MCP token issued (aud: ${exchanged.audienceNarrowed || "set"}, scope: ${exchanged.scopeNarrowed || "narrowed"})`,
						{ autoClose: agentToastMs.infoToken },
					);
				} else if (required) {
					tokenMsg = [
						"🔐 Token Exchange (RFC 8693): not configured",
						"   Tools ran via local fallback — the user access token was NOT sent to the MCP server.",
						"",
						"To enable full RFC 8693 exchange:",
						'   1. Create a PingOne Resource Server  audience: "banking_mcp_server"',
						"   2. Set MCP_RESOURCE_URI=banking_mcp_server  (Config UI or Vercel env)",
						"   3. Enable Token Exchange grant on the Admin OAuth app in PingOne",
						"   4. Sign out and sign in again",
					].join("\n");
					// Info-only: tools still work via local fallback
					// Chat already gets the full RFC 8693 setup explanation via addMessage('token-event').
					// Suppress the toast — the success toast is already shown and a concurrent info/error
					// toast would confuse users who just saw "Deposit complete".
				} else if (badScopes) {
					tokenMsg = [
						"⚠️ User token has insufficient scopes for RFC 8693 exchange",
						`   ${badScopes.explanation || "Need at least 5 OAuth scopes on the user token"}`,
						"",
						"Fix: Sign out → sign in again with a PingOne app that requests more scopes",
						"(openid, profile, email + banking scopes like banking:read, banking:accounts:read).",
					].join("\n");
					notifyError(
						"❌ Sign in again with broader scopes (at least 5) for MCP token exchange",
						{ autoClose: 7000 },
					);
				} else if (failed) {
					// When the server fell back to local handler after exchange failure,
					// the operation succeeded — show a soft info message, not an error toast.
					if (response._localFallback && response._exchangeFailed) {
						tokenMsg = [
							"⚠️ Token Exchange (RFC 8693) skipped — ran via local fallback",
							"   The exchange was attempted but PingOne could not grant the required scopes.",
							"   The banking operation completed successfully using the local handler.",
							"",
							"   To enable full RFC 8693 exchange, ensure the user token carries",
							"   banking:read / banking:write scopes (not just banking:ai:agent:read).",
						].join("\n");
						// No error toast — the tool result handled it as a success
					} else {
						tokenMsg = [
							`❌ Token Exchange (RFC 8693) failed: ${failed.error || "unknown error"}`,
							"",
							userTokEv?.mayActPresent
								? '   may_act was present — check that:\n   • PingOne has Token Exchange grant enabled on the admin OAuth app\n   • Audience policy allows "banking_mcp_server"\n   • may_act.client_id matches the BFF client'
								: "   may_act was absent — this is likely the cause.\n   Go to /demo-data → Enable may_act → sign out and sign in again.",
						].join("\n");
						notifyError(
							`❌ Token Exchange failed: ${failed.error || "unknown error"}`,
							{ autoClose: 6000 },
						);
					}
				}
				if (tokenMsg) {
					addMessage("token-event", tokenMsg, actionId);
				}
			}

			// Populate results panel + notify hosting dashboard (same CustomEvent in both display modes)
			const isWriteAction = ["transfer", "deposit", "withdraw"].includes(
				actionId,
			);
			let displayNormalized = normalizeAgentToolResult(response.result);
			if (isWriteAction) {
				try {
					const txRes = await getMyTransactions(30);
					const txNorm = normalizeAgentToolResult(txRes.result);
					if (Array.isArray(txNorm?.transactions)) {
						displayNormalized = txNorm;
					}
				} catch {
					// keep write payload for inferAgentResultTypeAndData
				}
				// Refresh live account balances after write operations so form dropdowns are current
				fetch("/api/accounts/my", { credentials: "include", _silent: true })
					.then((r) => (r.ok ? r.json() : null))
					.then((data) => {
						if (!data?.accounts?.length) return;
						setLiveAccounts(
							data.accounts.map((a) => ({
								id: a.id,
								name:
									a.name ||
									(a.accountType === "savings"
										? "Savings Account"
										: "Checking Account"),
								type: a.accountType || a.account_type || "checking",
								balance: a.balance || 0,
								accountNumber: a.accountNumber || a.account_number || a.id,
							})),
						);
					})
					.catch(() => {});
			}

			const { resultType, resultData } =
				inferAgentResultTypeAndData(displayNormalized);

			// Always dispatch so Flow Inspector (OAuthInspectorSection) refreshes token data
			// regardless of whether we could infer a structured result type.
			{
				const eventType = isWriteAction
					? "confirm"
					: resultType || "tool_complete";
				window.dispatchEvent(
					new CustomEvent("banking-agent-result", {
						detail: { type: eventType, data: resultData, label },
					}),
				);
			}

			if (resultType) {
				const titleMap = {
					accounts: "🏦 Accounts",
					transactions: "📋 Recent Transactions",
					balance: "💰 Balance",
					confirm: `✅ ${label} confirmed`,
				};
				setResultPanel({
					type: resultType,
					title: titleMap[resultType],
					data: resultData,
				});
			}

			addMessage("assistant", formatResult(response.result), actionId);

			// Append HTTP trace (banking API call detail) after success result if present
			const successTrace = response.result?.httpTrace;
			if (successTrace && successTrace.length > 0) {
				addMessage("assistant", formatHttpTrace(successTrace), actionId);
			}

			// ── Post-result educational RFC annotation ──
			{
				const exchanged = tokenEvents.find(
					(e) =>
						e.id === "exchanged-token" ||
						e.id === "two-ex-final-token" ||
						e.id === "two-ex-exchange1",
				);
				if (isWriteAction) {
					addMessage(
						"token-event",
						[
							`✅ **${label} complete — what just happened:**`,
							"",
							exchanged
								? `🔐 **RFC 8693 Token Exchange** — MCP token scoped to \`${exchanged.audienceNarrowed || "mcp-server"}\`, scope \`${exchanged.scopeNarrowed || "banking:write"}\``
								: `🔐 Ran via local handler (RFC 8693 token exchange not configured or skipped)`,
							`👤 **HITL gate** (RFC 8693 §2.1) — Transfers over the threshold require your explicit consent before the agent proceeds. The agent cannot self-approve: enforcement is server-side, before tool execution.`,
							"",
							`**RFCs in play:** RFC 8693 (token exchange) · RFC 6749 §3.3 (scope) · RFC 8707 (audience binding)`,
							`Open **Token Chain ↗** to inspect the MCP access token's \`act\`, \`aud\`, and \`scope\` claims.`,
						].join("\n"),
						actionId,
					);
				} else if (exchanged) {
					addMessage(
						"token-event",
						[
							`🔑 **Authorized by scope \`${exchanged.scopeNarrowed || "banking:read"}\`** · audience \`${exchanged.audienceNarrowed || "mcp-server"}\``,
							`   RFC 6749 §3.3 — every MCP call requires a scoped token; read operations use \`banking:read\`, writes require \`banking:write\`.`,
							`   RFC 8707 — the resource indicator binds the token to this specific audience and prevents it being accepted elsewhere.`,
						].join("\n"),
						actionId,
					);
				}
			}

			postAppEvent('agent', 'info', 'Agent processing complete', { tag: 'agent/processing-end', metadata: { userId: effectiveUser?.id || effectiveUser?.username } });
			// Dismiss loading toast and show success
			toast.update(toastId, {
				render: `✅ ${label} complete`,
				type: "success",
				isLoading: false,
				autoClose: agentToastMs.successAction,
			});
		} catch (err) {
			markToolProgressOutcome(false);
			toast.dismiss(toastId);

			// Phase 187 D-05: BFF signaled need_auth — redirect to PingOne customer login
			if (err?.need_auth) {
				addMessage(
					"assistant",
					"🔐 MCP requires your authorization — logging you in…",
				);
				handleLoginAction("login_user");
				setLoading(false);
				return;
			}

			if (actionId === "mcp_tools") {
				const st = agentFlowDiagram.getState();
				if (st.phase === "running" && st.toolName === "tools/list") {
					agentFlowDiagram.completeInspectorToolsList({
						ok: false,
						errorMessage: err.message || "Request failed",
					});
				}
			}

			const isConnErr =
				err.message.includes("timed out") ||
				err.message.includes("ECONNREFUSED") ||
				err.message.includes("ENETUNREACH") ||
				err.message.includes("mcp_error") ||
				err.message.includes("Failed to fetch") ||
				err.message.includes("502");

			const mcpToolsUnauthorized =
				actionId === "mcp_tools" &&
				/MCP tools fetch failed:\s*401/i.test(String(err?.message || ""));

			const hydrationAuthFailure =
				err?.code === "session_not_hydrated" ||
				(cookieOnlyBffSession &&
					(err?.statusCode === 401 ||
						err?.code === "authentication_required" ||
						mcpToolsUnauthorized ||
						/sign in to use the banking agent/i.test(
							String(err?.message || ""),
						)));

			if (isConnErr) {
				notifyError(
					"🔌 MCP server unreachable — check your server connection",
					{ autoClose: 8000 },
				);
			} else if (hydrationAuthFailure && cookieOnlyBffSession) {
				// Inline session-fix banner already shown on load for cookie-only Backend-for-Frontend (BFF); avoid duplicate toasts.
			} else if (err?.code === "session_not_hydrated") {
				notifyError(
					"Sign in again: server session has no tokens (Vercel needs Redis/Upstash + redeploy, then sign out & sign in).",
					{ autoClose: 12000 },
				);
			} else if (
				err?.statusCode === 401 &&
				(err?.response?.error === "unauthenticated" ||
					/Login required/i.test(String(err?.message || "")))
			) {
				// Phase 122: Non-logged-in users attempting banking actions
				addMessage(
					"assistant",
					"🔐 You need to sign in first to perform banking operations. Tap **Customer Sign In** in the left panel to get started.",
				);
			} else if (
				err?.statusCode === 401 ||
				err?.code === "authentication_required" ||
				/sign in to use the banking agent/i.test(String(err?.message || ""))
			) {
				notifyError(
					"Session missing or expired on the server. Try Refresh access token, or Sign in again.",
					{ autoClose: 9000 },
				);
			} else if (err?.code === "missing_exchange_scopes") {
				addMessage(
					"token-event",
					[
						"❌ **RFC 6749 §3.3 — Scope Error: missing required scopes**",
						`   Token lacks: \`${(err.missingScopes || []).join(", ") || "banking:write"}\``,
						"   RFC 6749 §3.3: access tokens carry a scope claim; resource servers MUST reject tokens missing required scopes.",
						"   RFC 8693 §2.1: token exchange cannot expand scopes — the MCP token can only carry scopes already on the user token.",
						"",
						"**Fix:** Sign out → sign in with the PingOne app that requests the required banking scopes.",
					].join("\n"),
					actionId,
				);
				setScopeErrorModal({
					missingScopes: err.missingScopes || [],
					userScopes: err.userScopes || "(none)",
					requiredScopes: err.requiredScopes || "",
					tokenEvents: err.tokenEvents || [],
				});
			} else if (err?.code === "mcp_scope_denied") {
				// Phase 211: scope-upgrade flow — save pending action and show consent modal
				// Phase 210 enforcement: MCP server returned JSON-RPC -32005 (INSUFFICIENT_SCOPE)
				addMessage(
					"token-event",
					[
						"⚠️ **OAuth 2.0 §3.3 — Scope Gate: `banking:write` required**",
						`   Tool \`${err.tool || actionId}\` requires: \`${(err.requiredScopes || []).join(", ")}\``,
						`   Your MCP token is missing: \`${(err.missingScopes || []).join(", ")}\``,
						"   The MCP server returned JSON-RPC -32005 (INSUFFICIENT_SCOPE).",
						"   Approve the scope upgrade below to exchange for a write-capable token (RFC 8693).",
					].join("\n"),
					actionId,
				);
				// Phase 211: save pending action for auto-replay after scope upgrade
				pendingScopeUpgradeRef.current = { actionId, form };
				setScopeErrorModal({
					missingScopes: err.missingScopes || [],
					userScopes: (err.availableScopes || []).join(" ") || "(none)",
					requiredScopes: (err.requiredScopes || []).join(" "),
					tokenEvents: err.tokenEvents || [],
					scopeUpgradeState: "error", // Phase 211: 4-state machine
				});
			} else if (err?.code === "mcp_step_up_required") {
				// MCP Authorize gate: PingOne (or simulated) requires step-up MFA before tool access
				const contextLine =
					err.message ||
					"MCP tool access requires identity verification (PingOne Authorize policy)";
				setOtpContextLine(contextLine);
				pendingOtpActionRef.current = { actionId, form };
				// Attempt P1MFA challenge
				try {
					const apiBase = process.env.REACT_APP_API_URL || "";
					const mfaResp = await fetch(`${apiBase}/api/auth/mfa/challenge`, {
						method: "POST",
						credentials: "include",
						headers: { "Content-Type": "application/json" },
					});
					if (mfaResp.ok) {
						const { daId, devices } = await mfaResp.json();
						setP1mfaDaId(daId);
						setP1mfaDevices(devices || []);
						setP1mfaMode(true);
					}
				} catch (mfaErr) {
					console.warn(
						"[MCP Authorize] P1MFA challenge failed, using basic OTP modal:",
						mfaErr.message,
					);
				}
				setShowOtpModal(true);
				addMessage(
					"assistant",
					`🔐 **Identity verification required**\n\n${contextLine}\n\nPlease complete the verification to continue.`,
					actionId,
				);
				addMessage(
					"token-event",
					[
						"📖 **RFC 9470 — OAuth 2.0 Step-Up Authentication Challenge Protocol**",
						'   The resource server returned `WWW-Authenticate: Bearer error="insufficient_user_authentication"`.',
						"   This means the current token was issued with a lower ACR (Authentication Context Reference) than the resource requires.",
						"   After MFA, PingOne issues a new token with `acr: Multi_Factor` (or equivalent) — the agent then retries automatically.",
						"",
						"**RFCs:** RFC 9470 (step-up) · RFC 6750 §3.1 (WWW-Authenticate) · RFC 8693 (token exchange for new ACR token)",
					].join("\n"),
					actionId,
				);
			} else if (err?.code === "mcp_authorization_denied") {
				// MCP Authorize gate: PingOne (or simulated) denied tool access
				const reason =
					err.message || "MCP tool access was denied by authorization policy";
				addMessage(
					"assistant",
					`🚫 **Access Denied**\n\n${reason}\n\nYour current session does not have sufficient authorization for this tool. Contact your administrator if you believe this is an error.`,
					actionId,
				);
				addMessage(
					"token-event",
					[
						"📖 **RFC 6749 §3.1 / RFC 8693 — Authorization Policy Denied**",
						"   The PingOne Authorize policy evaluated the request context (user, agent, action) and returned DENY.",
						"   This is a dynamic authorization decision — even a valid token can be rejected based on policy (time, location, risk score, ABAC attributes).",
						"   RFC 8693: the exchanged token carries claims that PingOne Authorize uses for policy evaluation.",
						"",
						"**RFCs:** RFC 6749 §3.1 (authorization endpoint) · RFC 8693 §2.1 (exchange claims) · RFC 8707 (resource indicators)",
					].join("\n"),
					actionId,
				);
			} else if (err?.code === "mcp_hitl_required") {
				// MCP Authorize gate: HITL approval needed before tool can execute
				const reason =
					err.message ||
					"This action requires your approval before the agent can proceed";
				// Extract taskId from the error (bankingAgentService puts response fields on the thrown error)
				const taskId = err.taskId;
				addMessage(
					"assistant",
					`👤 **Approval Required**\n\n${reason}\n\nPlease review and approve or deny this action.`,
					actionId,
				);
				// Reuse existing HITL consent intent: actionId + form for retry, plus taskId for polling
				setHitlPendingIntent({
					actionId,
					form,
					taskId,
					reason,
					isMcpHitl: true,
					intentPayload: null,
				});
			} else if (err?.code === "agent_consent_required") {
				// Old server deployment still enforcing startup consent gate.
				// The consent gate has been removed — sign out and sign in to refresh the session,
				// or ask the admin to redeploy the latest server code.
				notifyError(
					"Server configuration: please sign out and sign in again to clear the consent state.",
					{ autoClose: 10000 },
				);
			} else {
				notifyError(`❌ ${err.message}`, { autoClose: 6000 });
			}

			const authHint =
				err?.code === "session_not_hydrated"
					? ""
					: err?.statusCode === 401 || err?.code === "authentication_required"
						? "\n\nTip: use **Refresh access token** (left column), then retry. Sign in again only if refresh fails."
						: "";

			const showSessionFixBubble =
				err?.code === "session_not_hydrated" ||
				(cookieOnlyBffSession &&
					(err?.statusCode === 401 ||
						err?.code === "authentication_required" ||
						mcpToolsUnauthorized ||
						/sign in to use the banking agent/i.test(
							String(err?.message || ""),
						)));

			if (showSessionFixBubble) {
				if (!sessionFixBubbleShownRef.current) {
					sessionFixBubbleShownRef.current = true;
					addMessage("error", SESSION_NOT_HYDRATED_CHAT, actionId, {
						showSessionFixActions: true,
					});
				}
			} else if (err?.code === "agent_consent_required") {
				// Legacy startup consent gate — no longer enforced in current server code.
				addMessage(
					"assistant",
					"The server is requesting consent to use the agent, but this gate has been removed in the current version.\n\nPlease **sign out and sign in again** to clear the old session state.",
					actionId,
				);
			} else {
				addMessage(
					"error",
					isConnErr
						? "Banking Agent is unavailable.\n\nThe MCP server is not reachable.\n\nLocal: cd banking_mcp_server && npm run dev\nHosted: set MCP_SERVER_URL to your reachable MCP server URL (if your platform allows outbound WS)."
						: `Error: ${err.message}${authHint}`,
					actionId,
				);
			}

			const pathNorm = (location.pathname || "").replace(/\/$/, "") || "/";
			const onMarketingPublic = isPublicMarketingAgentPath(pathNorm);
			const authRelatedMarketingNudge =
				onMarketingPublic &&
				!isConnErr &&
				err?.code !== "agent_consent_required" &&
				(hydrationAuthFailure ||
					err?.statusCode === 401 ||
					err?.code === "authentication_required" ||
					err?.code === "session_not_hydrated" ||
					mcpToolsUnauthorized ||
					/sign in to use the banking agent/i.test(String(err?.message || "")));
			if (authRelatedMarketingNudge && !isLoggedIn) {
				addMessage("assistant", "🔐 Signing you in with PingOne…", actionId);
				handleLoginAction("login_user");
			}
		} finally {
			setLoading(false);
		}
	}

	function handleActionClick(actionId) {
		if (actionId !== "logout" && isAgentBlockedByConsentDecline()) {
			addMessage("assistant", AGENT_CONSENT_BLOCK_USER_MESSAGE);
			return;
		}
		if (actionId === "logout") {
			onLogout?.();
			return;
		}
		// No form needed for read-only queries
		if (
			actionId === "accounts" ||
			actionId === "transactions" ||
			actionId === "mcp_tools"
		) {
			runAction(actionId, {});
		} else if (actionId === "transfer") {
			// Pre-fill prompt with a ready-to-use example so the user can send immediately
			setNlInput("Transfer $100 from checking to savings");
		} else {
			setActiveAction(actionId);
		}
	}

	function openEducationCommand(cmd) {
		if (isAgentBlockedByConsentDecline()) {
			addMessage("assistant", AGENT_CONSENT_BLOCK_USER_MESSAGE);
			return;
		}
		if (cmd.flowDiagram) {
			window.dispatchEvent(new CustomEvent("agent-flow-diagram-open"));
			setIsOpen(false);
			return;
		}
		if (cmd.ciba && typeof window !== "undefined") {
			window.dispatchEvent(
				new CustomEvent("education-open-ciba", {
					detail: { tab: cmd.tab || "what" },
				}),
			);
			setIsOpen(false);
			return;
		}
		if (cmd.panel) {
			edu?.open(cmd.panel, cmd.tab || null);
			setIsOpen(false);
		}
	}

	/**
	 * Shared NL dispatch: education panels, banking tools, or fallback hint.
	 * @param {object} result - NL routing result from server
	 * @param {string} _source - routing source tag (unused)
	 * @param {string} nlUserText - original user text for post-auth replay
	 */
	// eslint-disable-next-line no-unused-vars
	async function dispatchNlResult(
		result,
		_source = "heuristic",
		nlUserText = "",
	) {
		if (result.kind === "education" && result.ciba) {
			openEducationCommand({ ciba: true, tab: result.tab });
			setIsOpen(false);
			addMessage(
				"assistant",
				`📲 CIBA Guide opened — see the sliding panel on the right.\n\n` +
					`CIBA (Client-Initiated Backchannel Authentication) lets the server request user approval out-of-band:\n` +
					`• Server calls POST /bc-authorize → PingOne sends email or push to user\n` +
					`• User approves from their inbox or device — no browser redirect needed\n` +
					`• Server polls POST /token until approved, then stores tokens server-side\n\n` +
					`Great for chat agents (redirect would break the flow) and high-value step-up transactions.\n` +
					`The guide has 8 tabs: What is CIBA · Sign-in & roles · Full stack · Token exchange · vs Login · Try It (live demo) · App Flows · PingOne Setup`,
			);
			return;
		}
		if (result.kind === "education" && result.education?.panel) {
			const panel = result.education.panel;
			const tab = result.education.tab || null;
			if (panel === EDU.CIMD) {
				window.dispatchEvent(
					new CustomEvent("education-open-cimd", {
						detail: { tab: tab || "what" },
					}),
				);
				setIsOpen(false);
				addMessage(
					"assistant",
					`📄 CIMD Simulator opened — see the sliding panel on the right.\n\n` +
						`OAuth Client ID Metadata Document (CIMD) redefines what a client_id is:\n` +
						`• Instead of an opaque string, the client_id is a URL you control\n` +
						`• That URL hosts a JSON document describing the client (redirect_uris, grant_types, scopes…)\n` +
						`• A CIMD-capable AS fetches the URL to learn the client's metadata — no pre-registration needed\n` +
						`• The client controls updates: just update the hosted document\n\n` +
						`This demo registers the client in PingOne via the Management API and hosts the document at:\n` +
						`/.well-known/oauth-client/{pingone-app-id}\n\n` +
						`Panel tabs: What is CIMD · CIMD vs DCR · Doc format · How AS uses it · Flow diagram · ▶ Simulate · PingOne`,
				);
				return;
			}
			const topicMsg = TOPIC_MESSAGES[panel];
			edu?.open(panel, tab);
			addMessage(
				"assistant",
				topicMsg
					? topicMsg
					: `Opened help panel: ${panel}. See the sliding panel on the right for details.`,
			);
			return;
		}
		if (result.kind === "banking" && result.banking?.action) {
			const { action, params } = result.banking;
			if (action === "logout") {
				addMessage("assistant", "Signing you out…");
				setTimeout(() => onLogout?.(), 800);
				return;
			}
			if (marketingGuestChatEnabled) {
				try {
					if (nlUserText && nlUserText.trim()) {
						sessionStorage.setItem(BX_AGENT_PENDING_NL_KEY, nlUserText.trim());
					}
				} catch (_) {}
				addMessage(
					"assistant",
					"**Taking you to PingOne** — after you sign in you’ll return here and we’ll continue with that banking request.",
				);
				handleLoginAction("login_user");
				return;
			}
			const p = normalizeBankingParams(params);
			if (action === "mcp_tools") {
				await runAction("mcp_tools", {}, { skipUserLabel: true });
				return;
			}
			if (action === "accounts" || action === "transactions") {
				await runAction(action, {}, { skipUserLabel: true });
			} else if (action === "balance" && p.accountId) {
				await runAction(
					"balance",
					{ accountId: p.accountId },
					{ skipUserLabel: true },
				);
			} else if (action === "transfer" && p.fromId && p.toId && p.amount) {
				// All params extracted by NL — execute directly
				await runAction("transfer", p, { skipUserLabel: true });
			} else if (action === "deposit" && p.amount) {
				await runAction("deposit", p, { skipUserLabel: true });
			} else if (action === "withdraw" && p.amount) {
				await runAction("withdraw", p, { skipUserLabel: true });
			} else if (
				["balance", "transfer", "deposit", "withdraw"].includes(action)
			) {
				// Missing params — open the form (pre-populate what we have)
				setActiveAction(action);
				addMessage(
					"assistant",
					`I'll help you ${action}. Fill in the details below.`,
				);
			} else {
				await runAction(action, p, { skipUserLabel: true });
			}
			return;
		}
		addMessage(
			"assistant",
			result.message ||
				"Try a banking action or a topic like “token exchange”.",
		);
	}

	/** NL API errors: 401 is session missing on server — not a parse failure. */
	function reportNlFailure(err) {
		if (err?.code === "session_not_hydrated") {
			if (!cookieOnlyBffSession) {
				notifyError(
					"Sign in again: server session has no tokens (Vercel needs Redis/Upstash + redeploy, then sign out & sign in).",
					{ autoClose: 12000 },
				);
			}
			if (!sessionFixBubbleShownRef.current) {
				sessionFixBubbleShownRef.current = true;
				addMessage("error", SESSION_NOT_HYDRATED_CHAT, null, {
					showSessionFixActions: true,
				});
			}
			const pSess = (location.pathname || "").replace(/\/$/, "") || "/";
			if (isPublicMarketingAgentPath(pSess)) {
				window.dispatchEvent(new CustomEvent("marketing-scroll-login"));
			}
			return;
		}
		if (
			err?.statusCode === 401 ||
			err?._status === 401 ||
			err?.code === "authentication_required"
		) {
			if (cookieOnlyBffSession) {
				if (!sessionFixBubbleShownRef.current) {
					sessionFixBubbleShownRef.current = true;
					addMessage("error", SESSION_NOT_HYDRATED_CHAT, null, {
						showSessionFixActions: true,
					});
				}
				return;
			}
			const p401 = (location.pathname || "").replace(/\/$/, "") || "/";
			if (isPublicMarketingAgentPath(p401) && !isLoggedIn) {
				addMessage("assistant", "🔐 Signing you in with PingOne…");
				handleLoginAction("login_user");
				return;
			}
			notifyError(
				"Sign in required — the server has no session for this request. Refresh the page and sign in again.",
				{ autoClose: agentToastMs.errShort },
			);
			addMessage(
				"assistant",
				"You need an active server session to use the agent. If you already signed in, refresh the page (session may have expired or cookies may not have reached the API).",
			);
			return;
		}
		const errorMessage =
			err.message ||
			err.error ||
			"An unexpected error occurred. Please try again.";
		notifyError(`❌ Could not parse request: ${errorMessage}`, {
			autoClose: agentToastMs.errShort,
		});
		addMessage("assistant", `Could not parse: ${errorMessage}`);
	}

	async function handleNaturalLanguage() {
		const text = nlInput.trim();
		if (!text) return;
		if (!isLoggedIn && !marketingGuestChatEnabled) return;
		if (isAgentBlockedByConsentDecline()) {
			addMessage("assistant", AGENT_CONSENT_BLOCK_USER_MESSAGE);
			return;
		}

		// Sequential thinking trigger: "think: [query]" or "reason: [query]"
		const thinkMatch = text.match(/^(?:think|reason):\s*(.+)/i);
		if (thinkMatch) {
			const query = thinkMatch[1].trim();
			addMessage("user", text);
			setNlInput("");
			setNlLoading(true);
			try {
				const res = await fetch("/api/mcp/inspector/invoke", {
					method: "POST",
					credentials: "include",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ tool: "sequential_think", params: { query } }),
					signal: AbortSignal.timeout(8000),
				});
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const data = await res.json();
				let steps = [],
					conclusion = "";
				try {
					const raw = data.result;
					const parsed = typeof raw === "string" ? JSON.parse(raw) : raw || {};
					steps = parsed.steps || [];
					conclusion = parsed.conclusion || "";
				} catch (_) {}
				addMessage("reasoning", "", null, { steps, conclusion });
			} catch (err) {
				addMessage("error", `Sequential thinking failed: ${err.message}`);
			} finally {
				setNlLoading(false);
			}
			return;
		}

		setNlLoading(true);
		addMessage("user", text);
		setNlInput("");
		try {
			const logQuery = parseLogPrompt(text);
			if (logQuery) {
				if (logQuery.type === "errors") {
					const params = new URLSearchParams({
						level: "error",
						limit: String(logQuery.limit),
					});
					const sources = ["console", "app", "vercel"];
					const results = await Promise.allSettled(
						sources.map((src) =>
							fetch(`/api/logs/${src}?${params.toString()}`, {
								credentials: "include",
							}),
						),
					);
					const merged = [];
					for (let i = 0; i < results.length; i += 1) {
						const res = results[i];
						if (res.status !== "fulfilled" || !res.value.ok) continue;
						const body = await res.value.json();
						(body.logs || []).forEach((log) => {
							merged.push({ ...log, _src: sources[i] });
						});
					}
					const top = merged
						.sort(
							(a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0),
						)
						.slice(0, logQuery.limit);
					if (top.length === 0) {
						addMessage(
							"assistant",
							`No error logs found in the last ${logQuery.limit} entries.`,
						);
					} else {
						const lines = top.map((l, idx) => {
							const when = new Date(l.timestamp || Date.now()).toLocaleString();
							return `${idx + 1}. [${(l.level || "error").toUpperCase()}] (${l._src}) ${when}\n   ${String(l.message || "").slice(0, 180)}`;
						});
						addMessage(
							"assistant",
							`Last ${top.length} errors:\n\n${lines.join("\n\n")}`,
						);
					}
				} else if (logQuery.type === "last_login") {
					const p = new URLSearchParams({
						username: logQuery.username,
						action: "LOGIN",
						limit: "1",
					});
					const res = await fetch(`/api/admin/activity?${p.toString()}`, {
						credentials: "include",
					});
					if (!res.ok) {
						if (res.status === 403) {
							addMessage(
								"assistant",
								"Log query requires admin access. Sign in as admin to query activity logs.",
							);
						} else {
							addMessage(
								"assistant",
								`Could not query login activity (HTTP ${res.status}).`,
							);
						}
					} else {
						const body = await res.json();
						const log = body.logs?.[0];
						if (!log) {
							addMessage(
								"assistant",
								`No successful login found for "${logQuery.username}".`,
							);
						} else {
							const when = new Date(log.timestamp).toLocaleString();
							addMessage(
								"assistant",
								`Last successful login for ${logQuery.username}:\n\n- Time: ${when}\n- Endpoint: ${log.endpoint || "/api/auth/login"}\n- IP: ${log.ipAddress || "n/a"}`,
							);
						}
					}
				}
				return;
			}
			const response = await sendAgentMessage(text);

			if (response._status === 428 && response.hitl) {
				// HITL consent required — wire to existing consent modal state
				const pendingConsentId = response.consentId;
				setHitlPendingIntent({
					actionId: "agent-hitl",
					intentPayload: {
						consentId: pendingConsentId,
						reason: response.reason || "High-value operation",
						operation: response.operation || {},
						originalMessage: text,
					},
					threshold: 500,
				});
				addMessage(
					"assistant",
					response.message ||
						"This operation requires your approval. Please confirm above.",
				);
				return;
			}

			// Sensitive data HITL — NL path: show consent modal before revealing account details
			if (response.consent_challenge_required) {
				addMessage(
					"assistant",
					"🔒 **Sensitive Account Data Request**\n\nThis will reveal your **full account numbers, routing numbers, SWIFT, and IBAN**. Please confirm before proceeding.",
					"sensitive-account-details",
				);
				setHitlPendingIntent({
					actionId: "sensitive-account-details",
					form: {},
					intentPayload: {
						type: "Sensitive Data Access",
						description:
							"Full account numbers · Routing numbers · SWIFT / IBAN",
						amount: 0,
					},
					threshold: 0,
					isSensitiveData: true,
				});
				return;
			}

			if (response.error || !response.success) {
				// MCP scope denial via NL path: show inline chat message
				if (response.error === "mcp_scope_denied") {
					// Phase 211: show 4-state consent modal instead of dead-end message
					addMessage(
						"token-event",
						[
							"⚠️ **OAuth 2.0 §3.3 — Scope Gate: `banking:write` required**",
							`   Tool \`${response.tool || "unknown"}\` requires write scope.`,
							"   Approve the scope upgrade below to exchange for a write-capable token (RFC 8693).",
						].join("\n"),
						undefined,
					);
					pendingScopeUpgradeRef.current = {
						actionId: response.tool || "create_transfer",
						form: {},
					};
					setScopeErrorModal({
						missingScopes: response.missingScopes || ["banking:write"],
						userScopes: (response.availableScopes || []).join(" ") || "(none)",
						requiredScopes: (response.requiredScopes || ["banking:write"]).join(
							" ",
						),
						tokenEvents: response.tokenEvents || [],
						scopeUpgradeState: "error",
					});
					return;
				}
				// Marketing guest: 401 / need_auth means "log in via PingOne", not session-hydration issue
				const pathNorm401 = (location.pathname || "").replace(/\/$/, "") || "/";
				if (
					(response.need_auth || response._status === 401) &&
					isPublicMarketingAgentPath(pathNorm401) &&
					!isLoggedIn
				) {
					try {
						sessionStorage.setItem(BX_AGENT_PENDING_NL_KEY, text);
					} catch (_) {}
					addMessage("assistant", "🔐 Signing you in with PingOne…");
					handleLoginAction("login_user");
					return;
				}
				const errMsg =
					response.error || "Agent could not process that request.";
				if (
					errMsg.includes("session") ||
					errMsg.includes("auth") ||
					response._status === 401
				) {
					reportNlFailure({ code: "session_not_hydrated" });
				} else {
					addMessage("assistant", `⚠️ ${errMsg}`);
				}
				return;
			}

			// Wire Agent Flow Inspector for NL path
			const nlToolName = response.toolsCalled?.[0] || "agent_message";
			if (response.toolsCalled?.length) {
				agentFlowDiagram.startMcpToolCall(nlToolName);
			}

			if (response.tokenEvents?.length) {
				appendTokenEvents(response.tokenEvents);
				if (tokenChain) {
					tokenChain.setTokenEvents("agent", response.tokenEvents);
				}
				response.tokenEvents.forEach((evt) => {
					const tokenMsg = formatTokenEvent(evt);
					if (tokenMsg) addMessage("token-event", tokenMsg, null);
				});
			}

			// Complete the flow diagram with results
			if (response.toolsCalled?.length) {
				agentFlowDiagram.completeMcpToolCall({
					toolName: nlToolName,
					tokenEvents: response.tokenEvents || [],
					ok: true,
				});
			}

			addMessage("assistant", response.reply || "Done.");

			// Show pop-out panel for all agent responses (structured or text)
			const { resultType, resultData } = inferAgentResultTypeAndData(response);
			const _isNlWrite =
				resultType === "confirm" ||
				["transfer", "deposit", "withdraw"].some((w) =>
					(response.toolsCalled || []).some((t) => t.includes(w)),
				);
			const titleMap = {
				accounts: "\uD83C\uDFE6 Accounts",
				transactions: "\uD83D\uDCCB Recent Transactions",
				balance: "\uD83D\uDCB0 Balance",
				confirm: "\u2705 Complete",
			};
			if (resultType) {
				setResultPanel({
					type: resultType,
					title: titleMap[resultType] || resultType,
					data: resultData,
				});
			} else if (response.reply) {
				setResultPanel({
					type: "text",
					title: "\uD83D\uDCAC Response",
					data: response.reply,
				});
			}
			// Always notify panels (token chain, inspector) that an NL agent request completed.
			// Write ops also send 'confirm' so dashboard/UserDashboard refreshes balances.
			window.dispatchEvent(
				new CustomEvent("banking-agent-result", {
					detail: { type: resultType || "nl_complete", data: resultData },
				}),
			);
			if (_isNlWrite) {
				window.dispatchEvent(
					new CustomEvent("banking-agent-result", {
						detail: { type: "confirm", data: resultData },
					}),
				);
				getMyTransactions(30)
					.then((txRes) => {
						const txNorm = normalizeAgentToolResult(txRes.result);
						if (Array.isArray(txNorm?.transactions)) {
							setResultPanel({
								type: "transactions",
								title: "\uD83D\uDCCB Recent Transactions",
								data: txNorm.transactions,
							});
						}
					})
					.catch(() => {});
			}
		} catch (err) {
			reportNlFailure(err);
		} finally {
			setNlLoading(false);
		}
	}

	// After marketing OAuth return: replay NL that triggered the login redirect.
	useEffect(() => {
		if (!nlResumeAfterAuth || !isLoggedIn) return;
		const text = nlResumeAfterAuth;
		setNlResumeAfterAuth(null);
		let cancelled = false;
		const timer = setTimeout(async () => {
			if (cancelled) return;
			addMessage("user", text);
			setNlLoading(true);
			try {
				const response = await sendAgentMessage(text);
				if (!cancelled) {
					if (response.error || !response.success) {
						reportNlFailure({ code: response.error || "unknown" });
					} else {
						addMessage("assistant", response.reply || "Done.");
						if (response.tokenEvents?.length) {
							appendTokenEvents(response.tokenEvents);
							if (tokenChain) {
								tokenChain.setTokenEvents("agent", response.tokenEvents);
							}
						}
					}
				}
			} catch (e) {
				if (!cancelled) reportNlFailure(e);
			} finally {
				if (!cancelled) setNlLoading(false);
			}
		}, 250);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot replay when nlResumeAfterAuth is set after OAuth
	}, [nlResumeAfterAuth, isLoggedIn]);

	// When any agent write (confirm event) fires, refresh an open transactions result panel.
	useEffect(() => {
		const onAgentWrite = () => {
			setResultPanel((prev) => {
				if (!prev || prev.type !== "transactions") return prev;
				// Fetch fresh transactions and update in-place
				getMyTransactions(30)
					.then((txRes) => {
						const txNorm = normalizeAgentToolResult(txRes.result);
						if (Array.isArray(txNorm?.transactions)) {
							setResultPanel({
								type: "transactions",
								title: "\uD83D\uDCCB Recent Transactions",
								data: txNorm.transactions,
							});
						}
					})
					.catch(() => {});
				return prev; // keep current while fetching
			});
		};
		window.addEventListener("banking-agent-result", onAgentWrite);
		return () =>
			window.removeEventListener("banking-agent-result", onAgentWrite);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Float mode should return nothing when the dedicated /agent page is active
	if (!isInline && isAgentPage) return null;

	// OTP modal handlers (Phase 174)
	const handleOtpSubmit = (otp) => {
		// If a step-up callback was stored (e.g. sensitive data after HITL), fire it directly
		if (pendingStepUpCallbackRef.current) {
			const cb = pendingStepUpCallbackRef.current;
			pendingStepUpCallbackRef.current = null;
			setShowOtpModal(false);
			setStepUpMethod("otp");
			setP1mfaMode(false);
			setP1mfaDaId(null);
			setP1mfaDevices([]);
			agentFlowDiagram.completeMfaChallenge(true);
			cb();
			return;
		}
		if (pendingOtpActionRef.current) {
			const { actionId, form } = pendingOtpActionRef.current;
			pendingOtpActionRef.current = null;
			setShowOtpModal(false);
			setStepUpMethod("otp");
			setP1mfaMode(false);
			setP1mfaDaId(null);
			setP1mfaDevices([]);
			// Verify MFA in flow diagram
			agentFlowDiagram.completeMfaChallenge(true);
			// Retry the original action with MFA verified
			runAction(actionId, form);
		}
	};

	const handleOtpCancel = () => {
		setShowOtpModal(false);
		setOtpContextLine("");
		pendingOtpActionRef.current = null;
		pendingStepUpCallbackRef.current = null;
		setP1mfaMode(false);
		setP1mfaDaId(null);
		setP1mfaDevices([]);
		setStepUpMethod("otp");
		addMessage(
			"assistant",
			"MFA request was cancelled. Please try again if needed.",
			"mfa-cancelled",
		);
		agentFlowDiagram.completeMfaChallenge(false);
	};

	// FIDO submit handler (Phase 174-03)
	const handleFidoSubmit = (credentialResponse) => {
		if (pendingStepUpCallbackRef.current) {
			const cb = pendingStepUpCallbackRef.current;
			pendingStepUpCallbackRef.current = null;
			setShowOtpModal(false);
			setStepUpMethod("otp");
			agentFlowDiagram.completeMfaChallenge(true);
			cb();
			return;
		}
		if (pendingOtpActionRef.current) {
			const { actionId, form } = pendingOtpActionRef.current;
			pendingOtpActionRef.current = null;
			setShowOtpModal(false);
			setStepUpMethod("otp");
			agentFlowDiagram.completeMfaChallenge(true);
			runAction(actionId, form);
		}
	};

	const handleSwitchToOtp = () => {
		setStepUpMethod("otp");
	};

	const handleSwitchToFido = () => {
		setStepUpMethod("fido");
	};

	// P1MFA completion handler (Phase 174-04)
	const handleP1MfaComplete = () => {
		if (pendingStepUpCallbackRef.current) {
			const cb = pendingStepUpCallbackRef.current;
			pendingStepUpCallbackRef.current = null;
			setShowOtpModal(false);
			setP1mfaMode(false);
			setP1mfaDaId(null);
			setP1mfaDevices([]);
			agentFlowDiagram.completeMfaChallenge(true);
			cb();
			return;
		}
		if (pendingOtpActionRef.current) {
			const { actionId, form } = pendingOtpActionRef.current;
			pendingOtpActionRef.current = null;
			setShowOtpModal(false);
			setP1mfaMode(false);
			setP1mfaDaId(null);
			setP1mfaDevices([]);
			agentFlowDiagram.completeMfaChallenge(true);
			runAction(actionId, form);
		}
	};

	const handleP1MfaError = (errorMsg) => {
		console.error("[BankingAgent] P1MFA error:", errorMsg);
	};

	/** Phase 211: perform scope upgrade exchange and auto-replay the pending action. */
	async function handleScopeUpgradeConfirm() {
		setScopeErrorModal((prev) =>
			prev ? { ...prev, scopeUpgradeState: "exchanging" } : prev,
		);
		addMessage(
			"token-event",
			"🔐 Scope upgrade approved — exchanging token for `banking:write` access (RFC 8693)…",
			"scope_upgrade",
		);
		try {
			const apiBase = process.env.REACT_APP_API_URL || "";
			const res = await fetch(`${apiBase}/api/mcp/scope-upgrade`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
			});
			const data = await res.json();
			if (!res.ok) {
				setScopeErrorModal((prev) =>
					prev
						? {
								...prev,
								scopeUpgradeState: "error",
								upgradeError: data.message || "Exchange failed",
							}
						: prev,
				);
				addMessage(
					"token-event",
					`❌ Scope upgrade failed: ${data.message || "Exchange did not return a write-scoped token."}`,
					"scope_upgrade",
				);
				return;
			}
			// Push exchange token events to TokenChainContext for educational display
			if (
				tokenChain &&
				Array.isArray(data.tokenEvents) &&
				data.tokenEvents.length > 0
			) {
				tokenChain.setTokenEvents("scope_upgrade", data.tokenEvents);
			}
			addMessage(
				"token-event",
				[
					"🔄 **RFC 8693 Token Exchange — Scope Upgrade**",
					"   Subject token: user access token (from BFF session)",
					"   Requested scope: `banking:write` (added to MCP token)",
					"   Result: write-scoped MCP access token stored in session",
					"   RFC 8693 §2.1: token exchange cannot expand beyond subject token scopes.",
					"   RFC 8693 §4.2: `act` claim on result identifies BFF as actor.",
				].join("\n"),
				"scope_upgrade",
			);
			setScopeErrorModal((prev) =>
				prev ? { ...prev, scopeUpgradeState: "done" } : prev,
			);
			addMessage(
				"token-event",
				"🔄 Write-scoped token ready — replaying original request…",
				"tool_replay",
			);
			// Auto-close and replay after brief delay
			setTimeout(() => {
				const pending = pendingScopeUpgradeRef.current;
				setScopeErrorModal(null);
				pendingScopeUpgradeRef.current = null;
				if (pending && pending.actionId) {
					runAction(pending.actionId, pending.form || {}, {
						skipUserLabel: true,
					});
				}
			}, 500);
		} catch (err) {
			setScopeErrorModal((prev) =>
				prev
					? { ...prev, scopeUpgradeState: "error", upgradeError: err.message }
					: prev,
			);
			addMessage(
				"token-event",
				`❌ Scope upgrade network error: ${err.message}`,
				"scope_upgrade",
			);
		}
	}

	const floatShell = (
		<div
			className={`banking-agent-float-root${distinctFloatingChrome && !isInline ? " banking-agent-float-root--distinct" : ""}`}
			data-agent-ui="floating"
		>
			{/* FAB - only shown when floating agent is collapsed (not in inline mode) */}
			{!isInline && !isOpen && (
				<button
					type="button"
					className="banking-agent-fab"
					onClick={() => setIsOpen(true)}
					aria-label={`Open ${brandShortName} AI Agent`}
					title={`Open ${brandShortName} AI Agent`}
				>
					<span className="banking-agent-fab-icon">🏦</span>
					<span className="banking-agent-fab-label">AI Agent</span>
				</button>
			)}

			{/* Results panel — sits to the left of the agent (portal-renders over page; works in all modes) */}
			{effectiveIsOpen && resultPanel && (
				<ResultsPanel
					panel={resultPanel}
					onClose={() => setResultPanel(null)}
					style={resultsPanelStyle}
				/>
			)}

			{/* Panel */}
			{effectiveIsOpen && (
				<div
					className={`banking-agent-panel${isDark ? "" : " ba-mode-light"}${isExpanded && !isInline ? " ba-expanded" : ""}${isInline ? " ba-mode-inline" : ""}${isBottomDock ? " ba-embedded-bottom-dock" : ""}${splitChrome ? " ba-split-column" : ""}`}
					role="dialog"
					aria-label={
						isConfigEmbeddedFocus
							? "Application setup assistant"
							: `${brandShortName} AI Agent`
					}
					ref={panelRef}
					style={panelStyle}
				>
					{/* P1 — Reconnecting banner: shown while Upstash write is still propagating */}
					{sessionReconnecting && (
						<div className="ba-reconnecting" role="status" aria-live="polite">
							<span className="ba-reconnecting__spinner" aria-hidden="true">
								⟳
							</span>
							Reconnecting to your session…
						</div>
					)}

					{/* Header — spans full width */}
					{/* In inline mode: no drag handle. In float mode: drag to reposition */}
					<div
						role="button"
						tabIndex={isInline ? -1 : 0}
						className={`ba-header${isInline ? "" : " banking-agent-drag-handle"}`}
						onPointerDown={isInline ? undefined : handleDragStart}
					>
						<div className="ba-header-top">
							<div className="ba-header-left">
								<span className="ba-status-dot" />
								<div>
									<div className="ba-title">
										{isConfigEmbeddedFocus
											? "Application setup assistant"
											: splitChrome
												? `${brandShortName} Assistant`
												: `${brandShortName} AI Agent`}
									</div>
									<div className="ba-subtitle">
										{isConfigEmbeddedFocus
											? isLoggedIn
												? `PingOne · OAuth · branding (${brandShortName}) · environment variables`
												: "Sign in to get started"
											: splitChrome
												? isLoggedIn
													? `${effectiveUser.role === "admin" ? "Admin" : "Customer"} · ${effectiveUser.firstName || effectiveUser.name?.split(" ")[0] || "Signed in"}`
													: marketingGuestChatEnabled
														? "Chat here — PingOne when you use banking"
														: "Sign in to get started"
												: isLoggedIn
													? `${effectiveUser.firstName || effectiveUser.name?.split(" ")[0] || "Signed in"} · ${effectiveUser.role === "admin" ? "👑 Admin" : "👤 Customer"}`
													: marketingGuestChatEnabled
														? "Chat here — PingOne when you use banking"
														: "Sign in to get started"}
									</div>
								</div>
							</div>
							{splitChrome &&
								isLoggedIn &&
								(effectiveUser?.id || effectiveUser?.username) && (
									<div className="ba-header-session">
										<div title="PingOne user id">
											{effectiveUser?.id || effectiveUser?.username}
										</div>
										<SessionExpiryTimer
											sessionInfo={effectiveUser}
											className="ba-header-session-timer"
										/>
									</div>
								)}
							<div className="ba-header-tools">
								{/* Expand/restore only available in float mode */}
								{!isInline && (
									<button
										type="button"
										className="ba-icon-btn"
										onClick={() => {
											setIsExpanded((e) => !e);
											setDragPos(null);
										}}
										title={
											isExpanded ? "Restore size" : "Expand to larger window"
										}
									>
										{isExpanded ? "⊟" : "⊞"}
									</button>
								)}
								{/* Popout window only available in float mode, or explicitly enabled via showPopOut */}
								{(!isInline || showPopOut) && (
									<button
										type="button"
										className="ba-icon-btn"
										onClick={() => {
											// Calculate optimal window size based on content and screen
											const calculateOptimalSize = () => {
												const screenWidth = window.screen.width;
												const screenHeight = window.screen.height;
												const minWidth = 420;
												const minHeight = 500;
												const maxWidth = Math.min(800, screenWidth * 0.8);
												const maxHeight = Math.min(900, screenHeight * 0.8);

												// Base size on current panel size but ensure it fits screen
												const width = Math.max(
													minWidth,
													Math.min(maxWidth, panelSize.width || 420),
												);
												let height = Math.max(
													minHeight,
													Math.min(maxHeight, panelSize.height || 500),
												);

												// Adjust height based on content length
												const messageCount = messages.length;
												if (messageCount > 10) {
													height = Math.min(
														maxHeight,
														height + (messageCount - 10) * 30,
													);
												}

												// Ensure window fits on screen with some margin
												const left = Math.max(
													50,
													Math.min(
														screenWidth - width - 50,
														window.screenX + 100,
													),
												);
												const top = Math.max(
													50,
													Math.min(
														screenHeight - height - 50,
														window.screenY + 100,
													),
												);

												return { width, height, left, top };
											};

											const { width, height, left, top } =
												calculateOptimalSize();

											window.open(
												"/agent",
												"BankingAgent",
												`width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes,toolbar=no,menubar=no,location=no,status=yes`,
											);
											onPopout?.();
										}}
										title="Open agent in new window"
										aria-label="Open agent in new window"
									>
										↗
									</button>
								)}
								<select
									className="ba-agent-appearance-select"
									value={agentAppearance}
									onChange={(e) => setAgentAppearance(e.target.value)}
									aria-label="Agent panel theme"
									title="Agent: match page theme, or use its own light/dark"
								>
									<option value="auto">Agent: Match page</option>
									<option value="light">Agent: Light</option>
									<option value="dark">Agent: Dark</option>
								</select>
								<button
									type="button"
									className="ba-icon-btn"
									onClick={() => toggleTheme()}
									title={
										appTheme === "dark"
											? "Page: switch to light mode"
											: "Page: switch to dark mode"
									}
								>
									{appTheme === "dark" ? "☀️" : "🌙"}
								</button>
								{splitChrome && isLoggedIn && (
									<button
										type="button"
										className="ba-header-signout"
										onClick={() => onLogout?.()}
									>
										Sign out
									</button>
								)}
								{!isInline && isLoggedIn && (
									<button
										type="button"
										className="ba-header-signout"
										onClick={() => onLogout()}
									>
										Sign out
									</button>
								)}
								{/* Collapse to FAB only in float mode */}
								{!isInline && isLoggedIn && (
									<button
										type="button"
										className="ba-icon-btn"
										onClick={() => setShowTokenChain((v) => !v)}
										aria-label={
											showTokenChain ? "Hide token chain" : "Show token chain"
										}
										title={
											showTokenChain ? "Hide token chain" : "Show token chain"
										}
									>
										{showTokenChain ? "🔗" : "⛓"}
									</button>
								)}
								{!isInline && (
									<button
										type="button"
										className="ba-icon-btn"
										onClick={() => setIsOpen(false)}
										aria-label="Collapse agent"
										title="Collapse agent"
									>
										▼
									</button>
								)}
							</div>
						</div>
					</div>

					{/* Two-column body */}
					<div className="ba-body">
						{isLoggedIn && consentBlocked && (
							<div className="ba-consent-denied-banner" role="alert">
								<div className="ba-consent-denied-banner__text">
									<strong>Access denied.</strong> You declined a high-value
									transaction. The AI banking assistant is not available for
									this session. Sign out and sign in again to restore it.
								</div>
								<div className="ba-consent-denied-banner__actions">
									<button
										type="button"
										className="ba-consent-denied-banner__btn ba-consent-denied-banner__btn--secondary"
										onClick={() => edu?.open(EDU.HUMAN_IN_LOOP, "decline")}
									>
										Learn: Human-in-the-loop
									</button>
									<button
										type="button"
										className="ba-consent-denied-banner__btn"
										onClick={() => onLogout?.()}
									>
										Sign out
									</button>
								</div>
							</div>
						)}

						{hitlPendingIntent &&
							(() => {
								const handleHitlConfirm = async () => {
									const { actionId, intentPayload } = hitlPendingIntent;

									// MCP Authorize HITL flow — approve via polling endpoint, then retry tool
									if (hitlPendingIntent.isMcpHitl && hitlPendingIntent.taskId) {
										const taskId = hitlPendingIntent.taskId;
										const retryActionId = hitlPendingIntent.actionId;
										const retryForm = hitlPendingIntent.form;
										setHitlPendingIntent(null);
										try {
											const approveResp = await fetch(
												`/api/mcp/decision/${taskId}/approve`,
												{
													method: "POST",
													credentials: "include",
													headers: { "Content-Type": "application/json" },
												},
											);
											if (!approveResp.ok) {
												const err = await approveResp.json().catch(() => ({}));
												throw new Error(
													err.message ||
														`Approval failed: ${approveResp.status}`,
												);
											}
											addMessage(
												"assistant",
												"✅ Approved — retrying your request…",
												retryActionId,
											);
											// Clear the mcpFirstToolAuthorizeDone block so the retry doesn't re-trigger the gate
											runAction(retryActionId, retryForm);
										} catch (err) {
											addMessage(
												"error",
												`Failed to approve: ${err.message}`,
												retryActionId,
											);
										}
										return;
									}

									// Sensitive data reveal — confirmed by user, now fetch and display
									if (hitlPendingIntent.isSensitiveData) {
										setHitlPendingIntent(null);
										setNlLoading(true);
										const sensToastId = toast.loading(
											"\uD83D\uDD12 Retrieving sensitive account details\u2026",
										);
										try {
											// Grant session consent so get_sensitive_account_details bypasses step-up gate.
											// HITL approval IS the authorization — no separate MFA/OTP needed in demo mode.
											try {
												await fetch("/api/accounts/sensitive-consent", {
													method: "POST",
													credentials: "include",
												});
											} catch (_) {
												/* non-fatal; server will fall back to ACR check */
											}

											const sensitiveRes = await sendAgentMessage(
												"Show me my full account details with routing numbers",
											);
											if (sensitiveRes.stepUpRequired) {
												// Consent fetch may have failed silently — fall back to OTP modal
												addMessage(
													"assistant",
													"\uD83D\uDD10 **Identity verification required**\n\nViewing full account details requires step-up authentication. Please complete the verification to continue.",
													"sensitive-account-details",
												);
												pendingStepUpCallbackRef.current = async () => {
													setNlLoading(true);
													const retryToastId = toast.loading(
														"\uD83D\uDD12 Retrieving sensitive account details\u2026",
													);
													try {
														const retryRes = await sendAgentMessage(
															"Show me my full account details with routing numbers",
														);
														if (retryRes.error || !retryRes.success) {
															addMessage(
																"assistant",
																`\u26A0\uFE0F ${retryRes.error || retryRes.reply || "Could not retrieve sensitive account details."}`,
																"sensitive-account-details",
															);
															toast.update(retryToastId, {
																render: "\u26A0\uFE0F Could not load details",
																type: "error",
																isLoading: false,
																autoClose: 4000,
															});
														} else {
															let detailsMsg =
																retryRes.reply ||
																"Sensitive account details retrieved.";
															if (retryRes.accountData?.accounts) {
																const { user: u, accounts: accs } =
																	retryRes.accountData;
																let fmt = "## \uD83D\uDCCB Account Details\n\n";
																if (u) {
																	fmt += `**Customer:** ${u.fullName || u.username}\n`;
																	if (u.email)
																		fmt += `**Email:** ${u.email}\n\n`;
																}
																fmt += "### Your Accounts\n";
																accs.forEach((acc) => {
																	fmt += `\n**${acc.accountType.toUpperCase()}** (${acc.name || acc.accountType})\n`;
																	fmt += `\u2022 Balance: $${(acc.balance || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })} ${acc.currency || "USD"}\n`;
																	const num =
																		acc.accountNumberFull || acc.accountNumber;
																	if (num)
																		fmt += `\u2022 Account #: \`${num}\`\n`;
																	if (acc.routingNumber)
																		fmt += `\u2022 Routing #: \`${acc.routingNumber}\`\n`;
																	if (acc.swiftCode)
																		fmt += `\u2022 SWIFT: \`${acc.swiftCode}\`\n`;
																	if (acc.iban)
																		fmt += `\u2022 IBAN: \`${acc.iban}\`\n`;
																	fmt += `\u2022 Status: ${acc.status}\n`;
																});
																fmt +=
																	"\n---\n_Protected by HITL consent \u00B7 scope: `banking:sensitive`_";
																detailsMsg = fmt;
															}
															addMessage(
																"assistant",
																detailsMsg,
																"sensitive-account-details",
															);
															if (retryRes.accountData) {
																setAccountDetailsPanel(retryRes.accountData);
																setAccountDetailsPanelPos({ x: 200, y: 100 });
															}
															toast.update(retryToastId, {
																render: "\u2705 Account details loaded",
																type: "success",
																isLoading: false,
																autoClose: 3000,
															});
														}
													} catch (retryErr) {
														addMessage(
															"error",
															`Failed to retrieve sensitive data: ${retryErr.message}`,
															"sensitive-account-details",
														);
														toast.update(retryToastId, {
															render: "\u274C Failed",
															type: "error",
															isLoading: false,
															autoClose: 4000,
														});
													} finally {
														setNlLoading(false);
													}
												};
												setOtpContextLine(
													"Sensitive account details require identity verification (RFC 9470)",
												);
												setShowOtpModal(true);
												toast.update(sensToastId, {
													render: "\uD83D\uDD10 MFA required",
													type: "warning",
													isLoading: false,
													autoClose: 4000,
												});
												return;
											}
											if (sensitiveRes.error || !sensitiveRes.success) {
												addMessage(
													"assistant",
													`\u26A0\uFE0F ${sensitiveRes.error || sensitiveRes.reply || "Could not retrieve sensitive account details."}`,
													"sensitive-account-details",
												);
												toast.update(sensToastId, {
													render: "\u26A0\uFE0F Could not load details",
													type: "error",
													isLoading: false,
													autoClose: 4000,
												});
											} else {
												let detailsMessage =
													sensitiveRes.reply ||
													"Sensitive account details retrieved.";
												if (
													sensitiveRes.accountData &&
													sensitiveRes.accountData.accounts
												) {
													const { user, accounts } = sensitiveRes.accountData;
													let formattedDetails =
														"## \uD83D\uDCCB Account Details\n\n";
													if (user) {
														formattedDetails += `**Customer:** ${user.fullName || user.username}\n`;
														if (user.email)
															formattedDetails += `**Email:** ${user.email}\n\n`;
													}
													formattedDetails += "### Your Accounts\n";
													accounts.forEach((acc) => {
														formattedDetails += `\n**${acc.accountType.toUpperCase()}** (${acc.name || acc.accountType})\n`;
														formattedDetails += `\u2022 Balance: $${(acc.balance || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })} ${acc.currency || "USD"}\n`;
														const displayAcctNum =
															acc.accountNumberFull || acc.accountNumber;
														if (displayAcctNum)
															formattedDetails += `\u2022 Account #: \`${displayAcctNum}\`\n`;
														if (acc.routingNumber)
															formattedDetails += `\u2022 Routing #: \`${acc.routingNumber}\`\n`;
														if (acc.swiftCode)
															formattedDetails += `\u2022 SWIFT: \`${acc.swiftCode}\`\n`;
														if (acc.iban)
															formattedDetails += `\u2022 IBAN: \`${acc.iban}\`\n`;
														formattedDetails += `\u2022 Status: ${acc.status}\n`;
													});
													formattedDetails +=
														"\n---\n_Protected by HITL consent \u00B7 scope: `banking:sensitive`_";
													detailsMessage = formattedDetails;
												}
												addMessage(
													"assistant",
													detailsMessage,
													"sensitive-account-details",
												);
												if (sensitiveRes.accountData) {
													setAccountDetailsPanel(sensitiveRes.accountData);
													setAccountDetailsPanelPos({ x: 200, y: 100 });
												}
												toast.update(sensToastId, {
													render: "\u2705 Account details loaded",
													type: "success",
													isLoading: false,
													autoClose: 3000,
												});
											}
										} catch (err) {
											addMessage(
												"error",
												`Failed to retrieve sensitive data: ${err.message}`,
												"sensitive-account-details",
											);
											toast.update(sensToastId, {
												render: "\u274C Failed",
												type: "error",
												isLoading: false,
												autoClose: 4000,
											});
										} finally {
											setNlLoading(false);
										}
										return;
									}

									// Agent HITL resume flow (LangChain agent)
									if (actionId === "agent-hitl" && intentPayload?.consentId) {
										const { consentId: pendingId, originalMessage } =
											intentPayload;
										setHitlPendingIntent(null);
										if (originalMessage) {
											setNlLoading(true);
											try {
												const response = await sendAgentMessage(
													originalMessage,
													pendingId,
												);
												if (response.tokenEvents?.length) {
													appendTokenEvents(response.tokenEvents);
													if (tokenChain) {
														tokenChain.setTokenEvents(
															"agent",
															response.tokenEvents,
														);
													}
												}
												addMessage(
													"assistant",
													response.reply || "✅ Operation completed.",
												);
											} catch (err) {
												addMessage(
													"error",
													`Failed to resume after consent: ${err.message}`,
												);
											} finally {
												setNlLoading(false);
											}
										}
										return;
									}

									// Existing transaction HITL flow
									try {
										const { data } = await bffAxios.post(
											"/api/transactions/consent-challenge",
											intentPayload,
										);
										const cid = data?.challengeId;
										if (!cid) {
											notifyError(
												"Could not start consent — no challenge id from server.",
											);
											setHitlPendingIntent(null);
											return;
										}
										setHitlPendingIntent(null);
										// Pass snapshot from POST response directly — avoids GET race on Vercel
										setHitlChallengeId({
											challengeId: cid,
											actionId,
											snapshot: data.snapshot || null,
										});
									} catch (ex) {
										const msg =
											ex.response?.data?.message ||
											ex.response?.data?.error ||
											ex.message ||
											"Could not start consent flow.";
										notifyError(msg);
										setHitlPendingIntent(null);
									}
								};
								const handleHitlCancel = async () => {
									// MCP HITL: also POST deny to the polling endpoint
									if (hitlPendingIntent.isMcpHitl && hitlPendingIntent.taskId) {
										try {
											await fetch(
												`/api/mcp/decision/${hitlPendingIntent.taskId}/deny`,
												{
													method: "POST",
													credentials: "include",
													headers: { "Content-Type": "application/json" },
												},
											);
										} catch {
											/* best-effort */
										}
										addMessage(
											"assistant",
											"🚫 You denied the MCP tool authorization request.",
											hitlPendingIntent.actionId,
										);
									}
									setHitlPendingIntent(null);
								};
								return isInline || isBottomDock ? (
									<HitlInlineCard
										transaction={hitlPendingIntent.intentPayload}
										threshold={hitlPendingIntent.threshold ?? 500}
										onConfirm={handleHitlConfirm}
										onCancel={handleHitlCancel}
									/>
								) : (
									<AgentConsentModal
										transaction={hitlPendingIntent.intentPayload}
										hitlThreshold={hitlPendingIntent.threshold ?? 500}
										onAccept={handleHitlConfirm}
										onDismiss={handleHitlCancel}
									/>
								);
							})()}

						{/* ── Scope-upgrade consent modal (Phase 211) ── */}
						{scopeErrorModal && (
							<div
								style={{
									position: "fixed",
									inset: 0,
									zIndex: 9999,
									background: "rgba(0,0,0,0.55)",
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									padding: "16px",
								}}
							>
								<div
									style={{
										background: "var(--color-bg-card, #1a1d27)",
										border: "1px solid var(--color-border, #2e3147)",
										borderRadius: "12px",
										padding: "28px 32px",
										maxWidth: "540px",
										width: "100%",
										boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
										color: "var(--color-text, #e2e4ef)",
										fontFamily: "inherit",
									}}
								>
									{/* ── error state ────────────────────────────────────────────────────────────────────────── */}
									{scopeErrorModal.scopeUpgradeState === "error" && (
										<>
											<div
												style={{
													display: "flex",
													alignItems: "center",
													gap: "10px",
													marginBottom: "16px",
												}}
											>
												<span style={{ fontSize: "22px" }}>🔐</span>
												<h3
													style={{
														margin: 0,
														fontSize: "17px",
														fontWeight: 700,
													}}
												>
													Scope Upgrade Required
												</h3>
											</div>
											<p
												style={{
													margin: "0 0 12px",
													lineHeight: 1.6,
													fontSize: "14px",
												}}
											>
												This action requires{"  "}
												<code
													style={{
														background: "rgba(255,200,80,0.15)",
														padding: "1px 6px",
														borderRadius: "4px",
													}}
												>
													banking:write
												</code>
												{"  "}scope. Your current MCP token does not include it.
												You can approve a scope upgrade — the BFF will exchange
												your token for a write-capable version via{"  "}
												<strong>RFC 8693</strong>.
											</p>
											<div
												style={{
													background: "rgba(255,80,80,0.08)",
													border: "1px solid rgba(255,80,80,0.25)",
													borderRadius: "8px",
													padding: "12px 14px",
													marginBottom: "16px",
													fontSize: "13px",
												}}
											>
												<div style={{ marginBottom: "6px" }}>
													<span style={{ opacity: 0.7 }}>Missing scopes:</span>{" "}
													{(scopeErrorModal.missingScopes &&
													scopeErrorModal.missingScopes.length
														? scopeErrorModal.missingScopes
														: ["banking:write"]
													).map((s) => (
														<code
															key={s}
															style={{
																background: "rgba(255,80,80,0.15)",
																borderRadius: "4px",
																padding: "1px 6px",
																marginLeft: "4px",
																fontSize: "12px",
															}}
														>
															{s}
														</code>
													))}
												</div>
												<div>
													<span style={{ opacity: 0.7 }}>Your token has:</span>{" "}
													{(scopeErrorModal.userScopes || "")
														.split(" ")
														.filter(Boolean)
														.map((s) => (
															<code
																key={s}
																style={{
																	background: "rgba(100,100,200,0.15)",
																	borderRadius: "4px",
																	padding: "1px 6px",
																	marginLeft: "4px",
																	fontSize: "12px",
																}}
															>
																{s}
															</code>
														))}
												</div>
											</div>
											{scopeErrorModal.upgradeError && (
												<p
													style={{
														color: "var(--color-error, #f87171)",
														fontSize: "13px",
														marginBottom: "12px",
													}}
												>
													{scopeErrorModal.upgradeError}
												</p>
											)}
											<div
												style={{
													display: "flex",
													gap: "10px",
													justifyContent: "flex-end",
												}}
											>
												<button
													type="button"
													onClick={() => setScopeErrorModal(null)}
													style={{
														padding: "8px 20px",
														borderRadius: "8px",
														border: "1px solid var(--color-border, #2e3147)",
														background: "transparent",
														color: "var(--color-text, #e2e4ef)",
														fontWeight: 600,
														fontSize: "14px",
														cursor: "pointer",
													}}
												>
													Cancel
												</button>
												<button
													type="button"
													onClick={() =>
														setScopeErrorModal((prev) =>
															prev
																? { ...prev, scopeUpgradeState: "confirm" }
																: prev,
														)
													}
													style={{
														padding: "8px 20px",
														borderRadius: "8px",
														border: "none",
														background: "var(--color-primary, #4f7df3)",
														color: "#fff",
														fontWeight: 600,
														fontSize: "14px",
														cursor: "pointer",
													}}
												>
													Approve Scope Upgrade
												</button>
											</div>
										</>
									)}

									{/* ── confirm state ────────────────────────────────────────────────────────────────────────── */}
									{scopeErrorModal.scopeUpgradeState === "confirm" && (
										<>
											<div
												style={{
													display: "flex",
													alignItems: "center",
													gap: "10px",
													marginBottom: "16px",
												}}
											>
												<span style={{ fontSize: "22px" }}>🔏</span>
												<h3
													style={{
														margin: 0,
														fontSize: "17px",
														fontWeight: 700,
													}}
												>
													Confirm Scope Upgrade
												</h3>
											</div>
											<p
												style={{
													margin: "0 0 16px",
													lineHeight: 1.6,
													fontSize: "14px",
												}}
											>
												You are granting the AI agent{" "}
												<code
													style={{
														background: "rgba(100,200,100,0.12)",
														padding: "1px 6px",
														borderRadius: "4px",
													}}
												>
													banking:write
												</code>{" "}
												access for this session. This allows the agent to
												complete{"  "}
												<strong>transfers, deposits, and withdrawals</strong> on
												your behalf.
											</p>
											<p
												style={{
													margin: "0 0 16px",
													lineHeight: 1.6,
													fontSize: "13px",
													opacity: 0.8,
												}}
											>
												The BFF will perform an{"  "}
												<strong>RFC 8693 Token Exchange</strong> — your user
												access token becomes the subject, the agent client is
												the actor, and the result is a narrowly-scoped MCP token
												valid for this session only.
											</p>
											<div
												style={{
													display: "flex",
													gap: "10px",
													justifyContent: "flex-end",
												}}
											>
												<button
													type="button"
													onClick={() =>
														setScopeErrorModal((prev) =>
															prev
																? { ...prev, scopeUpgradeState: "error" }
																: prev,
														)
													}
													style={{
														padding: "8px 20px",
														borderRadius: "8px",
														border: "1px solid var(--color-border, #2e3147)",
														background: "transparent",
														color: "var(--color-text, #e2e4ef)",
														fontWeight: 600,
														fontSize: "14px",
														cursor: "pointer",
													}}
												>
													Back
												</button>
												<button
													type="button"
													onClick={handleScopeUpgradeConfirm}
													style={{
														padding: "8px 20px",
														borderRadius: "8px",
														border: "none",
														background: "var(--color-primary, #4f7df3)",
														color: "#fff",
														fontWeight: 600,
														fontSize: "14px",
														cursor: "pointer",
													}}
												>
													Confirm &amp; Exchange Token
												</button>
											</div>
										</>
									)}

									{/* ── exchanging state ──────────────────────────────────────────────────────────────────────── */}
									{scopeErrorModal.scopeUpgradeState === "exchanging" && (
										<>
											<div
												style={{
													display: "flex",
													alignItems: "center",
													gap: "12px",
													marginBottom: "16px",
												}}
											>
												<span style={{ fontSize: "22px" }}>🔄</span>
												<h3
													style={{
														margin: 0,
														fontSize: "17px",
														fontWeight: 700,
													}}
												>
													Exchanging Token…
												</h3>
											</div>
											<p style={{ margin: 0, fontSize: "14px", opacity: 0.8 }}>
												Performing RFC 8693 token exchange to obtain a{" "}
												<code style={{ padding: "1px 5px" }}>
													banking:write
												</code>
												{"-scoped MCP token."}
											</p>
										</>
									)}

									{/* ── done state ───────────────────────────────────────────────────────────────────────────────── */}
									{scopeErrorModal.scopeUpgradeState === "done" && (
										<>
											<div
												style={{
													display: "flex",
													alignItems: "center",
													gap: "12px",
													marginBottom: "16px",
												}}
											>
												<span style={{ fontSize: "22px" }}>✅</span>
												<h3
													style={{
														margin: 0,
														fontSize: "17px",
														fontWeight: 700,
													}}
												>
													Scope Upgraded — Replaying Request
												</h3>
											</div>
											<p style={{ margin: 0, fontSize: "14px", opacity: 0.8 }}>
												Write-scoped MCP token obtained. Retrying your original
												request automatically…
											</p>
										</>
									)}
								</div>
							</div>
						)}

						{/* OTP + transaction execution — rendered once challenge is created */}
						{hitlChallengeId && (
							<TransactionConsentModal
								open
								challengeId={hitlChallengeId.challengeId}
								preloadedSnapshot={hitlChallengeId.snapshot}
								user={effectiveUser}
								onClose={() => setHitlChallengeId(null)}
								onTransactionSuccess={(msg) => {
									const { actionId } = hitlChallengeId;
									setHitlChallengeId(null);
									addMessage(
										"assistant",
										`✅ **Transaction approved and completed.**\n\n${msg}`,
										actionId,
									);
									notifySuccess(`✅ ${msg}`);
									// Notify UserDashboard to refresh accounts if it happens to be mounted
									window.dispatchEvent(
										new CustomEvent("banking-agent-hitl-confirmed", {
											detail: { actionId, successMsg: msg },
										}),
									);
								}}
								onDeclinedConfirmed={() => {
									setHitlChallengeId(null);
									addMessage(
										"assistant",
										"❌ **Transaction declined.**\n\nThe transaction was not completed.",
										hitlChallengeId.actionId,
									);
								}}
							/>
						)}

						{/* OTP/FIDO Step-Up Modal (Phase 174) */}
						{stepUpMethod === "fido" && !p1mfaMode ? (
							<FidoStepUpModal
								show={showOtpModal}
								contextLine={otpContextLine}
								onSubmit={handleFidoSubmit}
								onCancel={handleOtpCancel}
								fallbackToOtp={handleSwitchToOtp}
							/>
						) : (
							<OtpStepUpModal
								show={showOtpModal}
								contextLine={otpContextLine}
								onSubmit={handleOtpSubmit}
								onCancel={handleOtpCancel}
								allowFido={supportsFido && !p1mfaMode}
								onSwitchToFido={handleSwitchToFido}
								mode={p1mfaMode ? "p1mfa" : "stub"}
								daId={p1mfaDaId}
								devices={p1mfaDevices}
								onP1MfaComplete={handleP1MfaComplete}
								onP1MfaError={handleP1MfaError}
							/>
						)}

						{/* MCP Tools List Modal */}
						<MCPToolsListModal
							show={showMcpToolsModal}
							onClose={() => setShowMcpToolsModal(false)}
							tools={mcpToolsList}
						/>

						{/* Account Details Side Panel */}
						{accountDetailsPanel && (
							<AccountDetailsPanel
								accountData={accountDetailsPanel}
								initialPos={accountDetailsPanelPos}
								onClose={() => setAccountDetailsPanel(null)}
							/>
						)}

						{/* ── Left column: suggestions + actions/auth ── */}
						<div className="ba-left-col">
							{isLoggedIn && (
								<div className="ba-session-row">
									<button
										type="button"
										className="ba-action-item"
										onClick={() => void handleSessionRefresh()}
										disabled={sessionRefreshing || loading || consentBlocked}
										title="Refresh your access token using PingOne refresh token (no logout)"
									>
										{sessionRefreshing ? "Refreshing…" : "🔄 Refresh"}
									</button>
									<button
										type="button"
										className="ba-action-item"
										onClick={() =>
											handleLoginAction(
												effectiveUser?.role === "admin"
													? "login_admin"
													: "login_user",
											)
										}
										disabled={loading || consentBlocked}
										title="Sign in again if refresh fails"
									>
										🔐 Sign in
									</button>
								</div>
							)}

							{suggestionList.map((s) => (
								<button
									key={s}
									type="button"
									className="ba-suggestion"
									disabled={consentBlocked}
									onClick={() => {
										if (isAgentBlockedByConsentDecline()) {
											addMessage("assistant", AGENT_CONSENT_BLOCK_USER_MESSAGE);
											return;
										}
										setNlInput(s);
										if (isLoggedIn || marketingGuestChatEnabled) {
											// Save chip text before clearing input — if an auth error fires mid-flight
											// and triggers handleLoginAction (which reads sessionStorage), the prompt survives.
											try {
												sessionStorage.setItem(
													BX_AGENT_PENDING_NL_KEY,
													s.trim(),
												);
											} catch (_) {}
											setNlInput("");
											addMessage("user", s);
											setNlLoading(true);
											// Chip dispatch: check for log queries before hitting BFF sendAgentMessage.
											// "Show me last 5 errors" is handled client-side via parseLogPrompt to avoid LLM fallback.
											const _chipLogQuery = parseLogPrompt(s);
											if (_chipLogQuery && _chipLogQuery.type === "errors") {
												(async () => {
													try {
														const _params = new URLSearchParams({
															level: "error",
															limit: String(_chipLogQuery.limit),
														});
														const _sources = ["console", "app", "vercel"];
														const _results = await Promise.allSettled(
															_sources.map((src) =>
																fetch(`/api/logs/${src}?${_params.toString()}`, {
																	credentials: "include",
																}),
															),
														);
														const _merged = [];
														for (let _i = 0; _i < _results.length; _i += 1) {
															const _r = _results[_i];
															if (_r.status !== "fulfilled" || !_r.value.ok) continue;
															const _body = await _r.value.json();
															(_body.logs || []).forEach((log) => {
																_merged.push({ ...log, _src: _sources[_i] });
															});
														}
														const _top = _merged
															.sort(
																(a, b) =>
																	new Date(b.timestamp || 0) - new Date(a.timestamp || 0),
															)
															.slice(0, _chipLogQuery.limit);
														if (_top.length === 0) {
															addMessage(
																"assistant",
																`No error logs found in the last ${_chipLogQuery.limit} entries.`,
															);
														} else {
															const _lines = _top.map((l, idx) => {
																const when = new Date(l.timestamp || Date.now()).toLocaleString();
																return `${idx + 1}. [${(l.level || "error").toUpperCase()}] (${l._src}) ${when}\n   ${String(l.message || "").slice(0, 180)}`;
															});
															addMessage(
																"assistant",
																`Last ${_top.length} errors:\n\n${_lines.join("\n\n")}`,
															);
														}
														try {
															sessionStorage.removeItem(BX_AGENT_PENDING_NL_KEY);
														} catch (_) {}
													} catch (_chipErr) {
														addMessage("assistant", `Could not fetch error logs: ${_chipErr.message}`);
													} finally {
														setNlLoading(false);
													}
												})();
											} else {
											sendAgentMessage(s)
												.then((res) => {
													if (res.error || !res.success) reportNlFailure(res);
													else {
														// Chip completed successfully — clear the pending key
														try {
															sessionStorage.removeItem(
																BX_AGENT_PENDING_NL_KEY,
															);
														} catch (_) {}
														if (res.tokenEvents?.length) {
															appendTokenEvents(res.tokenEvents);
															if (tokenChain) {
																tokenChain.setTokenEvents(
																	"agent",
																	res.tokenEvents,
																);
															}
														}
														addMessage("assistant", res.reply || "Done.");
													}
												})
												.catch((err) => reportNlFailure(err))
												.finally(() => setNlLoading(false));
											}
										}
									}}
								>
									"{s}"
								</button>
							))}

							<div className="ba-left-divider" />

							{isLoggedIn ? (
								<>
									{isLoggedIn && renderActionGroups()}

									<div className="ba-left-divider" />

									<div className="ba-left-divider" />

									{/* "All actions" discovery popout trigger */}
									<button
										ref={discoveryTriggerRef}
										type="button"
										className={"ba-all-actions-btn" + (showDiscovery ? " active" : "")}
										onClick={() => setShowDiscovery((v) => !v)}
										disabled={consentBlocked}
										aria-expanded={showDiscovery}
										aria-haspopup="dialog"
									>
										⊞ All actions
									</button>
								</>
							) : (
								<>
									{/* Enhanced unauthenticated agent chip group with login prompt */}
									<div className="ba-left-guest-chips">
										<div className="ba-left-label">
											Get started with AI Banking:
										</div>

										{/* Primary login chip - more prominent */}
										<button
											type="button"
											className="ba-action-item ba-action-item--login"
											onClick={() => handleLoginAction("login_user")}
										>
											<span className="ba-action-item-icon">&#128274;</span>
											<span className="ba-action-item-text">
												<span className="ba-action-item-title">
													Sign in to access banking features
												</span>
												<span className="ba-action-item-desc">
													Secure login with PingOne
												</span>
											</span>
											<span className="ba-action-item-arrow">&#8594;</span>
										</button>

										<div className="ba-left-label-secondary">
											Or explore these topics:
										</div>

										{/* Educational chips */}
										<div className="ba-guest-chips-grid">
											{[
												{
													id: "guest_oauth",
													label: "What is OAuth?",
													icon: "🔑",
												},
												{ id: "guest_pkce", label: "Explain PKCE", icon: "🔏" },
												{ id: "guest_mcp", label: "Explain MCP", icon: "🧠" },
												{
													id: "guest_agent",
													label: "How AI agents work",
													icon: "🤖",
												},
											].map((chip) => (
												<button
													key={chip.id}
													type="button"
													className="ba-action-item ba-action-item--guest"
													onClick={() => {
														setNlInput("");
														addMessage("user", chip.label);
														setNlLoading(true);
														sendAgentMessage(chip.label)
															.then((res) => {
																if (res.error || !res.success)
																	reportNlFailure(res);
																else {
																	if (res.tokenEvents?.length) {
																		appendTokenEvents(res.tokenEvents);
																		if (tokenChain) {
																			tokenChain.setTokenEvents(
																				"agent",
																				res.tokenEvents,
																			);
																		}
																	}
																	addMessage("assistant", res.reply || "Done.");
																}
															})
															.catch((err) => reportNlFailure(err))
															.finally(() => setNlLoading(false));
													}}
												>
													<span className="ba-action-item-icon">
														{chip.icon}
													</span>
													<span className="ba-action-item-text">
														{chip.label}
													</span>
												</button>
											))}
										</div>
									</div>
									<div className="ba-left-auth">
										<div className="ba-left-auth-notice">
											{marketingGuestChatEnabled
												? "🔐 Banking uses PingOne — we’ll redirect you when you ask for accounts, transfers, etc."
												: "🔐 Sign in required to access AI banking features"}
										</div>
										<button
											type="button"
											className="ba-left-auth-btn primary"
											onClick={() => handleLoginAction("login_user")}
											disabled={oauthConfig === null || !oauthConfig?.user}
											title={
												oauthConfig?.user
													? "Sign in as a bank customer"
													: "Configure credentials first"
											}
										>
											👤 Customer Sign In
										</button>
										<button
											type="button"
											className="ba-left-auth-btn"
											onClick={() => handleLoginAction("login_admin")}
											disabled={oauthConfig === null || !oauthConfig?.admin}
											title={
												oauthConfig?.admin
													? "Sign in as administrator"
													: "Configure credentials first"
											}
										>
											👑 Admin Sign In
										</button>
										<button
											type="button"
											className={`ba-left-config-btn${isConfigured ? " configured" : ""}`}
											onClick={() => {
												setIsOpen(false);
												navigate("/config");
											}}
										>
											{isConfigured
												? "✅ PingOne Configured"
												: "⚙️ Configure PingOne"}
										</button>
									</div>
								</>
							)}
						</div>

						{/* ── Middle column: token chain (collapsible + resizable) ── */}
						{showTokenChain && isLoggedIn && tokenChain && (
							<>
								<div
									className="ba-middle-col"
									style={{ width: `${tokenChainWidth}px` }}
								>
									<TokenChainDisplay />
								</div>
								<div
									className="ba-middle-col-resize-handle"
									onMouseDown={handleTokenChainResize}
									title="Drag to resize token chain"
								/>
							</>
						)}

						{/* ── Right column: chat messages + input ── */}
						<div className="ba-right-col">
							{/* Messages */}
							<div
								className="banking-agent-messages"
								ref={messagesContainerRef}
							>
								{messages.length === 0 && (
									<div className="ba-welcome">
										<p>
											{isLoggedIn
												? "Type a message or pick an action on the left."
												: marketingGuestChatEnabled
													? isConfigured
														? "Ask about OAuth or try a suggestion - we will open PingOne only when you need banking."
														: "Set up PingOne in Application setup - you can still ask general questions once configured."
													: isConfigured
														? "PingOne is configured - sign in to get started."
														: "Set up your PingOne credentials to get started."}
										</p>
									</div>
								)}
								{messages.map((msg) => {
									if (msg.role === "reasoning") {
										return (
											<div key={msg.id} className="banking-agent-msg reasoning">
												<span
													className="banking-agent-msg-avatar banking-agent-msg-avatar--tool"
													aria-hidden
												>
													🧠
												</span>
												<div className="banking-agent-msg-bubble banking-agent-msg-bubble--reasoning">
													<ReasoningSteps
														steps={msg.steps}
														conclusion={msg.conclusion}
													/>
												</div>
											</div>
										);
									}
									if (msg.role === "tool-progress") {
										return (
											<div
												key={msg.id}
												className="banking-agent-msg tool-progress"
											>
												<span
													className="banking-agent-msg-avatar banking-agent-msg-avatar--tool"
													aria-hidden
												>
													⚙
												</span>
												<div className="banking-agent-msg-bubble banking-agent-msg-bubble--toolsteps">
													<ToolProgressChips steps={msg.steps} />
												</div>
											</div>
										);
									}
									if (msg.role === "error" && msg.showSessionFixActions) {
										return (
											<div key={msg.id} className="banking-agent-msg error">
												<div className="banking-agent-msg-bubble banking-agent-msg-bubble--session-fix">
													<pre className="banking-agent-msg-text">
														{msg.content}
													</pre>
													<div className="ba-session-fix-actions">
														<button
															type="button"
															className="ba-session-fix-btn ba-session-fix-btn--secondary"
															onClick={() =>
																window.open(
																	"/api/auth/debug?deep=1",
																	"_blank",
																	"noopener,noreferrer",
																)
															}
														>
															Open session debug
														</button>
														<button
															type="button"
															className="ba-session-fix-btn ba-session-fix-btn--secondary"
															onClick={() => handleLoginAction("login_admin")}
														>
															Admin
														</button>
														<button
															type="button"
															className="ba-session-fix-btn ba-session-fix-btn--secondary"
															onClick={() => handleLoginAction("login_user")}
														>
															Login
														</button>
														<button
															type="button"
															className="ba-session-fix-btn"
															onClick={() => onLogout?.()}
														>
															Sign out (then sign in again)
														</button>
													</div>
												</div>
											</div>
										);
									}
									return (
										<div
											key={msg.id}
											className={`banking-agent-msg ${msg.role}`}
										>
											{msg.role === "assistant" && (
												<span className="banking-agent-msg-avatar">🏦</span>
											)}
											<div className="banking-agent-msg-bubble">
												<pre className="banking-agent-msg-text">
													{msg.content}
												</pre>
												{msg.tool && (
													<span className="banking-agent-tool-badge">
														⚙ {msg.tool}
													</span>
												)}
											</div>
										</div>
									);
								})}
								{loading && (
									<div className="banking-agent-msg assistant typing">
										<span className="banking-agent-msg-avatar">🏦</span>
										<div className="banking-agent-msg-bubble">
											<span className="banking-agent-dots">
												<span />
												<span />
												<span />
											</span>
										</div>
									</div>
								)}
								<div ref={bottomRef} />
							</div>

							{/* Discovery popout — "All actions" overlay */}
							{isLoggedIn && showDiscovery && (
								<div
									role="dialog"
									aria-modal="true"
									aria-label="Action browser"
									className={"ba-discovery-popout ba-discovery-popout--open"}
								>
									<div className="ba-discovery-header">
										<span>⊞ All actions</span>
										<button
											type="button"
											className="ba-discovery-close"
											onClick={() => {
												setShowDiscovery(false);
												setDiscoverySearch("");
												discoveryTriggerRef.current?.focus();
											}}
											aria-label="Close action browser"
										>
											✕
										</button>
									</div>

									<input
										className="ba-discovery-search"
										type="text"
										placeholder="Search actions…"
										value={discoverySearch}
										onChange={(e) => setDiscoverySearch(e.target.value)}
										aria-label="Search actions"
										data-role="popout-search"
									/>

									<div className="ba-discovery-body">
										{filteredDiscoveryGroups.length === 0 ? (
											<div className="ba-discovery-empty">
												<div className="ba-discovery-empty-heading">No matching actions</div>
												<div>Try a different search term, or clear the search to see all actions.</div>
											</div>
										) : (
											filteredDiscoveryGroups.map((group) => (
												<React.Fragment key={group.key}>
													<div className="ba-commands-section">
														{group.label}
													</div>
													<div className="ba-chips">
														{group.chips.map((chip) => (
															<button
																key={chip.id}
																type="button"
																className={"ba-chip" + (group.isEducation ? " ba-chip--learn" : "")}
																onClick={() => {
																	if (group.isEducation) {
																		openEducationCommand(chip);
																	} else {
																		handleActionClick(chip.id);
																	}
																	setShowDiscovery(false);
																	setDiscoverySearch("");
																}}
																disabled={consentBlocked}
															>
																{chip.label}
															</button>
														))}
													</div>
												</React.Fragment>
											))
										)}
									</div>
								</div>
							)}

							{/* Action form (when user selects a transaction action) */}
							{activeAction && (
								<div
									ref={actionFormAnchorRef}
									className="ba-action-form-anchor"
								>
									<ActionForm
										action={activeAction}
										loading={loading}
										onSubmit={(form) => runAction(activeAction, form)}
										onCancel={() => setActiveAction(null)}
										effectiveUser={effectiveUser}
										liveAccounts={liveAccounts}
									/>
								</div>
							)}

							{/* Bottom input bar */}
							<div className="ba-bottom">
								{isLoggedIn || marketingGuestChatEnabled ? (
									<div className="ba-input-row">
										<input
											className="ba-input"
											value={nlInput}
											onChange={(e) => setNlInput(e.target.value)}
											onKeyDown={(e) => {
												if (e.key === "Enter" && !e.shiftKey) {
													e.preventDefault();
													handleNaturalLanguage();
												}
											}}
											placeholder={
												marketingGuestChatEnabled && !isLoggedIn
													? `Ask about OAuth or type a banking request…`
													: splitChrome && !nlMeta?.groqConfigured
														? "Ask about your accounts…"
														: nlMeta?.groqConfigured
															? `Message ${brandShortName} AI… (Groq AI)`
															: `Message ${brandShortName} AI…`
											}
											disabled={nlLoading || consentBlocked}
										/>
										<button
											type="button"
											className="ba-send-btn"
											onClick={() => {
												handleNaturalLanguage();
											}}
											disabled={nlLoading || !nlInput.trim() || consentBlocked}
											aria-label="Send"
										>
											{nlLoading ? "…" : splitChrome ? "Send" : "↑"}
										</button>
									</div>
								) : (
									<div
										style={{
											padding: "10px 12px",
											textAlign: "center",
											color: "var(--ba-muted)",
											fontSize: "12px",
										}}
									>
										Sign in using the buttons on the left to start chatting
									</div>
								)}
							</div>

							{/* Dashboard navigation button — pinned below prompt (hidden on marketing pages) */}
							{isLoggedIn &&
								!isPublicMarketingAgentPath(
									(location.pathname || "").replace(/\/$/, "") || "/",
								) && (
									<button
										type="button"
										className="ba-left-auth-btn primary"
										style={{
											margin: "6px 12px 0",
											width: "calc(100% - 24px)",
											display: "block",
										}}
										onClick={() => {
											setIsOpen(false);
											navigate(
												effectiveUser?.role === "admin" ? "/admin" : "/dashboard",
											);
										}}
									>
										{effectiveUser?.role === "admin"
											? "👑 Admin Dashboard"
											: "📊 My Dashboard"}
									</button>
								)}

							{/* Connected services chips — below prompt */}
							<div className="ba-chips-footer">
								<span
									className="ba-server-chip ba-server-chip--active"
									title={
										isConfigEmbeddedFocus
											? "MCP tools (same server — use for discovery)"
											: "Banking AI tools service — connected"
									}
								>
									<span className="ba-chip-dot" />
									{isConfigEmbeddedFocus ? "MCP tools" : "Banking Tools"}
									{mcpStatus.connected && mcpStatus.toolCount != null && (
										<span className="ba-chip-count">
											{mcpStatus.toolCount} actions
										</span>
									)}
								</span>
								<span
									className="ba-server-chip ba-server-chip--active"
									title="PingOne Identity — connected"
								>
									<span className="ba-chip-dot" />
									PingOne Identity
								</span>
							</div>
						</div>
					</div>
					{/* Resize handles — all 8 directions, float mode only */}
					{!isInline && (
						<>
							<div
								role="button"
								tabIndex="0"
								className="ba-resize-handle ba-resize-handle--se"
								onMouseDown={(e) => handleResize(e, "se")}
								aria-label="Resize southeast"
							/>
							<div
								role="button"
								tabIndex="0"
								className="ba-resize-handle ba-resize-handle--e"
								onMouseDown={(e) => handleResize(e, "e")}
								aria-label="Resize east"
							/>
							<div
								role="button"
								tabIndex="0"
								className="ba-resize-handle ba-resize-handle--s"
								onMouseDown={(e) => handleResize(e, "s")}
								aria-label="Resize south"
							/>
							<div
								role="button"
								tabIndex="0"
								className="ba-resize-handle ba-resize-handle--n"
								onMouseDown={(e) => handleResize(e, "n")}
								aria-label="Resize north"
							/>
							<div
								role="button"
								tabIndex="0"
								className="ba-resize-handle ba-resize-handle--ne"
								onMouseDown={(e) => handleResize(e, "ne")}
								aria-label="Resize northeast"
							/>
							<div
								role="button"
								tabIndex="0"
								className="ba-resize-handle ba-resize-handle--nw"
								onMouseDown={(e) => handleResize(e, "nw")}
								aria-label="Resize northwest"
							/>
							<div
								role="button"
								tabIndex="0"
								className="ba-resize-handle ba-resize-handle--w"
								onMouseDown={(e) => handleResize(e, "w")}
								aria-label="Resize west"
							/>
							<div
								role="button"
								tabIndex="0"
								className="ba-resize-handle ba-resize-handle--sw"
								onMouseDown={(e) => handleResize(e, "sw")}
								aria-label="Resize southwest"
							/>
						</>
					)}
				</div>
			)}
		</div>
	);

	// Inline/embed stays in React tree; float mounts on body so position:fixed is never trapped
	// by .App / shell overflow or theme transforms, and works the same on /logs and app routes.
	if (isInline) return <>{floatShell}</>;
	return createPortal(floatShell, document.body);
}
