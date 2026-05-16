// banking_api_server/services/geminiNlIntent.js
/**
 * Intent parsing — priority: HEURISTIC (instant) → Ollama (local LLM fallback).
 * Heuristic handles all known commands (accounts, balance, transfer, education topics) with zero latency.
 * Ollama is only called when heuristic returns kind:'none' (unrecognized input).
 */
'use strict';

const { parseHeuristic, EDU } = require('./nlIntentParser');
const { sanitizeNlResult } = require('./nlIntentSanitize');
const { callHelixAgent } = require('./helixLlmService');
const configStore = require('./configStore');

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'mistral';
const OLLAMA_TIMEOUT_MS = 10000;

console.log(`[NL Intent] LLM config: model=${OLLAMA_MODEL} url=${OLLAMA_BASE_URL} timeout=${OLLAMA_TIMEOUT_MS}ms`);

const SYSTEM = `You are a strict JSON router for the Super Banking demo SPA.

CRITICAL CONTEXT — read every time before responding:
• The user IS already authenticated and viewing their own banking dashboard.
• Banking tools (accounts, balance, transactions, transfer, deposit, withdraw,
  spending_summary, biggest_purchase, mortgage_demo) WILL execute server-side
  against the user's real session — your job is ONLY to classify intent.
• You have full authority to answer banking questions about THIS user's data.
  NEVER refuse with "I can't access your account" or "this is a demo platform"
  or "log in to your real bank" — the user IS logged in to this banking app
  and these tools work. Always emit a banking action when intent is clear.
• Output ONLY a JSON object (no markdown fences, no commentary, no prose).

Allowed shapes (one per response):
{"kind":"education","education":{"panel":"login-flow|token-exchange|may-act|mcp-protocol|introspection|agent-gateway|rfc-index|step-up|pingone-authorize|cimd|cua|human-in-loop|langchain","tab":"what"}}
{"kind":"education","ciba":true,"tab":"what"}
{"kind":"banking","banking":{"action":"accounts","params":{}}}
{"kind":"banking","banking":{"action":"balance","params":{}}}
{"kind":"banking","banking":{"action":"balance","params":{"accountId":"chk-xxxxxxxx"}}}
{"kind":"banking","banking":{"action":"transactions","params":{}}}
{"kind":"banking","banking":{"action":"transfer","params":{"fromId":"checking","toId":"savings","amount":100}}}
{"kind":"banking","banking":{"action":"deposit","params":{"toId":"checking","amount":100}}}
{"kind":"banking","banking":{"action":"withdraw","params":{"fromId":"checking","amount":50}}}
{"kind":"banking","banking":{"action":"biggest_purchase","params":{}}}
{"kind":"banking","banking":{"action":"spending_summary","params":{}}}
{"kind":"banking","banking":{"action":"mortgage_demo","params":{}}}
{"kind":"banking","banking":{"action":"mcp_tools","params":{}}}
{"kind":"banking","banking":{"action":"web_search","query":"<query string>"}}
{"kind":"none","message":"short hint"}

Pipes in examples (accounts|balance) mean "pick one action" — never output pipe characters or the word "optional" as a field value.

ACTION VOCABULARY (intent → action mapping for every chip phrase):

accounts — list of all the user's accounts
  "accounts" / "my accounts" / "show my accounts" / "list accounts"

balance — single-account balance (omit accountId unless user gave a real id like chk-…)
  "balance" / "check balance" / "show my checking balance" / "what is my checking account balance" / "what's my home loan balance" → balance

transactions — list of recent transactions, optionally filtered by date or amount
  "transactions" / "recent transactions" / "show me transactions from the last 30 days"
  "what transactions did I make this month" / "any purchases last week"
  "transactions this quarter" / "any transactions under $10" / "transactions between $50-150"
  "any unusual transactions" / "what's my average transaction amount"
  "dining transactions over $50" → transactions (categorical filtering happens client-side)

transfer / deposit / withdraw — money movement (require amount + optionally fromId/toId)
  "transfer" → transfer with empty params (UI prompts for amount)
  "transfer $600 from my savings account to checking" → transfer {fromId:"savings", toId:"checking", amount:600}
  "deposit 100 into savings" → deposit {toId:"savings", amount:100}
  "withdraw 50 from checking" → withdraw {fromId:"checking", amount:50}
  Account types are "checking" or "savings" only — never IDs/numbers.

biggest_purchase — single biggest spend
  "biggest purchase" / "what's my biggest purchase" / "show me my large purchases over $100"
  "what was my highest transaction ever" / "max purchase" / "largest transaction"
  "most expensive" / "highest spend" / "what did I spend the most on"

spending_summary — totals, breakdowns, percentages, category analysis, comparison vs last period
  "how much did I spend on groceries" / "spending summary" / "total spending"
  "what percentage of my spending was over $100" / "what are my top spending categories"
  "how much on groceries this month" / "total gas purchases this quarter"
  "retail purchases last 30 days" / "am I spending more or less than last month"
  "how can I reduce spending" / "where is my money going"
  spending_summary returns a category breakdown — use it for percentage / category /
  comparison / recommendation questions. Returns one summary, never per-day.

mortgage_demo — Phase 267 Path A demo (api-key disposition via banking_mortgage_service)
  "show mortgage data" / "show my mortgage" / "mortgage" / "home loan"
  "mortgage balance" / "mortgage details" / "mortgage payment" / "my home loan"
  ALWAYS return params:{} — the route exposes a single fixed record;
  do not invent loan IDs or amounts. Note: "what's my home loan BALANCE" → balance,
  but "show me my home loan" / "mortgage details" → mortgage_demo.

mcp_tools — list of MCP tools available to the agent
  Triggered by "list" / "show" / "get" + "mcp tools" / "tools available" / "available tools"
  / standalone "list tools" / "show tools".
  "list of mcp tools" → mcp_tools
  "what tools are available" → mcp_tools
  NEVER route these to education even if "mcp" appears.

web_search — explicit research / lookup question that isn't about the user's data
  "search for PingOne token exchange" → web_search {query:"PingOne token exchange"}
  "find information about RFC 8693" → web_search {query:"RFC 8693"}

EDUCATION (use only for "how does X work" or "what is X" questions, never for the user's own data):
  CIMD / client-id-metadata / dynamic client registration / DCR / RFC 7591 → panel cimd
  CUA / computer use agent / computer use → panel cua
  LangChain / LCEL / multi-provider LLM / model-agnostic → panel langchain
  How MCP works / what is MCP (NO list/show/get verb) → panel mcp-protocol
  Token exchange explained / what is RFC 8693 → panel token-exchange
  CIBA / what is CIBA / how does backchannel auth work → ciba:true

REFUSAL POLICY:
  Refuse only for unsupported account types: if the user asks to pay/transfer/send
  money involving a "credit card", "credit account", or "investment account" →
  {"kind":"none","message":"This demo only supports Checking and Savings accounts. Credit cards and investment accounts are not available."}
  For ALL OTHER banking questions, return a banking action — never refuse on
  privacy/access/demo-disclaimer grounds. The user owns their data and the tools
  return their data.`;


/**
 * Answer a general knowledge question using Helix when banking intent parsing fails.
 * @param {string} userMessage
 * @param {{ role?: string, firstName?: string }} [context]
 * @returns {Promise<object|null>} education result with markdown answer or null
 */
async function answerWithHelix(userMessage, context = {}) {
  try {
    // Use getEffective so committed FIELD_DEFS defaults (base_url, env_id,
    // agent_id, prompt_field_id) work for fresh clones with empty SQLite.
    // helix_api_key must still be supplied by the operator.
    const helixConfig = {
      helix_base_url: configStore.getEffective('helix_base_url'),
      helix_api_key: configStore.getEffective('helix_api_key'),
      helix_environment_id: configStore.getEffective('helix_environment_id'),
      helix_agent_id: configStore.getEffective('helix_agent_id'),
      helix_prompt_field_id: configStore.getEffective('helix_prompt_field_id'),
    };

    // Check if Helix is configured
    if (!helixConfig.helix_base_url || !helixConfig.helix_api_key) {
      console.warn('[nlIntent] Helix not configured');
      return null;
    }

    const messages = [
      {
        role: 'system',
        content: 'You are a knowledgeable assistant for a banking demo platform. Answer the user\'s question concisely and accurately. Keep your answer to 1-2 paragraphs.',
      },
      {
        role: 'user',
        content: userMessage,
      },
    ];

    const answer = await callHelixAgent(helixConfig, messages);
    if (answer) {
      return {
        kind: 'education',
        education: { panel: 'general-knowledge' },
        message: answer,
      };
    }
  } catch (err) {
    console.warn('[nlIntent] Helix error:', err.message);
  }
  return null;
}

/**
 * @param {string} userMessage
 * @param {{ role?: string, firstName?: string }} [context]
 * @returns {Promise<object|null>} parsed result object or null to fall through
 */
async function parseWithOllama(userMessage, context = {}) {
  const systemWithCtx = context.role
    ? `${SYSTEM}\n\nSigned-in user: role=${context.role}${context.firstName ? ', name=' + context.firstName : ''}. ${
        context.role === 'admin'
          ? 'Admin users can query ALL accounts and transactions system-wide, not just their own.'
          : 'This is a regular customer — banking actions apply to their own accounts only.'
      }`
    : SYSTEM;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [
          { role: 'system', content: systemWithCtx },
          { role: 'user', content: userMessage },
        ],
        stream: false,
        options: { temperature: 0.1 },
        format: 'json',
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn('[nlIntent] Ollama HTTP', res.status);
      return null;
    }

    const data = await res.json();
    const text = data?.message?.content;
    if (!text) return null;

    const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/m, '').trim();
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === 'object' && parsed.kind) return parsed;
  } catch (e) {
    if (e.name === 'AbortError') {
      console.warn('[nlIntent] Ollama timeout (%dms) — skipping', OLLAMA_TIMEOUT_MS);
    } else {
      console.warn('[nlIntent] Ollama error:', e.message);
    }
  } finally {
    clearTimeout(timeout);
  }
  return null;
}

/**
 * @param {string} message
 * @param {{ role?: string, firstName?: string }} [context] - user context for role-aware routing
 * @param {string} [provider='auto'] - 'auto' (heuristic→helix), 'ollama' (skip heuristic, requires Ollama configured), 'helix'. See llmProviderResolver.
 * @returns {Promise<{ source: 'ollama'|'heuristic'|'helix'|'helix_fallback', result: object }>}
 */
async function parseNaturalLanguage(message, context = {}, provider = 'auto', langchainConfig = {}) {
  // 1. HEURISTIC ALWAYS RUNS as a deterministic safety net (zero latency).
  // ff_heuristic_enabled=false (the agent UI's "LLM only" toggle) means "prefer LLM",
  // not "disable heuristic" — if every LLM falls through, we still want the heuristic
  // answer instead of a canned "I didn't catch that" UI fallback.
  const heuristicEnabled = configStore.getEffective('ff_heuristic_enabled') !== 'false';
  const heuristicResult = parseHeuristic(message);
  if (heuristicEnabled && heuristicResult && heuristicResult.kind !== 'none') {
    return { source: 'heuristic', result: heuristicResult };
  }

  // 2. FALLBACK TO LLM — when heuristic doesn't recognize the input
  // Use configured provider (Helix, Ollama, etc.) based on langchainConfig
  const { resolveLlmProvider } = require('./llmProviderResolver');
  const selectedProvider = provider === 'auto'
    ? resolveLlmProvider(langchainConfig).provider
    : provider;

  // Try selected provider first for NL intent routing
  if (selectedProvider === 'helix') {
    const systemWithCtx = context.role
      ? `${SYSTEM}\n\nSigned-in user: role=${context.role}${context.firstName ? ', name=' + context.firstName : ''}. ${
          context.role === 'admin'
            ? 'Admin users can query ALL accounts and transactions system-wide, not just their own.'
            : 'This is a regular customer — banking actions apply to their own accounts only.'
        }`
      : SYSTEM;

    try {
      // Use getEffective so FIELD_DEFS defaults reach fresh clones (see answerWithHelix).
      const helixConfig = {
        helix_base_url: langchainConfig.helix_base_url || configStore.getEffective('helix_base_url'),
        helix_api_key: langchainConfig.helix_api_key || configStore.getEffective('helix_api_key'),
        helix_environment_id: langchainConfig.helix_environment_id || configStore.getEffective('helix_environment_id'),
        helix_agent_id: langchainConfig.helix_agent_id || configStore.getEffective('helix_agent_id'),
        helix_prompt_field_id: langchainConfig.helix_prompt_field_id || configStore.getEffective('helix_prompt_field_id'),
      };

      // Check if Helix is configured
      if (!helixConfig.helix_base_url || !helixConfig.helix_api_key) {
        console.warn('[nlIntent] Helix not configured; falling back to Ollama');
      } else {
        const helixResult = await callHelixAgent(helixConfig, [
          { role: 'system', content: systemWithCtx },
          { role: 'user', content: message },
        ]);

        const tryParse = (text) => {
          if (!text) return null;
          const cleaned = String(text).replace(/^```json\s*/i, '').replace(/```\s*$/m, '').trim();
          try {
            const parsed = JSON.parse(cleaned);
            if (parsed && typeof parsed === 'object' && parsed.kind && parsed.kind !== 'none') return parsed;
          } catch (e) {
            // not JSON — fall through to refusal-detection retry
          }
          return null;
        };

        let parsed = tryParse(helixResult);
        if (parsed) return { source: 'helix', result: parsed };

        // Retry-on-refusal: when Helix returns prose (especially a refusal like
        // "I cannot fulfill that request"), nudge it to emit JSON and re-classify.
        // Detection is intentionally loose — any non-JSON response from a chip
        // phrase is a misclassification we want to fix.
        const looksLikeRefusal = helixResult &&
          /\b(cannot|can't|unable|won'?t|not able|do not have access|don't have access|this is a (banking )?demo|log in to your)\b/i.test(helixResult);
        if (helixResult && (looksLikeRefusal || !parsed)) {
          console.warn('[nlIntent] Helix returned non-JSON or refusal — retrying with explicit JSON-only nudge');
          const nudge = systemWithCtx +
            `\n\nRETRY NOTE: Your previous response was not valid JSON or was a refusal. ` +
            `You MUST output ONLY a JSON object matching one of the allowed shapes above. ` +
            `Do not refuse on privacy/demo grounds — the user is authenticated and tools work. ` +
            `If unsure, default to {"kind":"banking","banking":{"action":"spending_summary","params":{}}} ` +
            `for spending/category/percentage questions, {"action":"transactions","params":{}} for ` +
            `transaction lists, or {"action":"balance","params":{}} for balance questions.`;
          try {
            const retry = await callHelixAgent(helixConfig, [
              { role: 'system', content: nudge },
              { role: 'user', content: message },
            ]);
            parsed = tryParse(retry);
            if (parsed) return { source: 'helix', result: parsed };
          } catch (e) {
            console.warn('[nlIntent] Helix retry failed:', e.message);
          }
        }
        // kind:'none' or still non-JSON — fall through to conversational Helix answer
      }
    } catch (err) {
      console.warn('[nlIntent] Helix error:', err.message);
    }
  }

  // In LLM-only mode skip Ollama entirely — go straight to conversational Helix answer.
  if (!heuristicEnabled) {
    const helixAnswer = await answerWithHelix(message, context).catch((e) => {
      console.warn('[nlIntent] Helix conversational failed:', e.message);
      return null;
    });
    if (helixAnswer) {
      return { source: 'helix_fallback', result: helixAnswer };
    }
    // LLM-only mode but no LLM produced an answer (e.g. Helix not configured,
    // network failure). Fall back to the heuristic so chips and known phrases
    // still work — never let a UI canned "I didn't catch that" win.
    if (heuristicResult && heuristicResult.kind !== 'none') {
      console.warn('[nlIntent] LLM-only mode: no LLM produced an answer — falling back to heuristic');
      return { source: 'heuristic', result: heuristicResult };
    }
    return { source: 'heuristic', result: heuristicResult };
  }

  // Heuristic mode: try Ollama for unrecognized input
  const ollama = await parseWithOllama(message, context).catch((e) => {
    console.warn('[nlIntent] Ollama error:', e.message);
    return null;
  });
  if (ollama) {
    const { result, rejected, reason } = sanitizeNlResult(ollama, message);
    if (rejected) console.warn('[nlIntent] Ollama output rejected → heuristic:', reason);
    return { source: rejected ? 'heuristic' : 'ollama', result };
  }

  // 3. Try Helix for general knowledge questions when banking intent fails (fallback only)
  if (selectedProvider === 'helix' || (selectedProvider === 'auto' && langchainConfig?.provider === 'helix')) {
    const helixAnswer = await answerWithHelix(message, context).catch((e) => {
      console.warn('[nlIntent] Helix fallback failed:', e.message);
      return null;
    });
    if (helixAnswer) {
      return { source: 'helix_fallback', result: helixAnswer };
    }
  }

  // 4. Final fallback: return whatever heuristic gave (recognized result or kind:none).
  // The heuristic always ran at step 1; if it produced kind:none, this is the canonical
  // "no LLM available and heuristic didn't match" outcome — the UI shows its canned hint.
  return { source: 'heuristic', result: heuristicResult };
}

module.exports = {
  parseNaturalLanguage,
  EDU,
};
