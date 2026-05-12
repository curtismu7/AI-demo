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

const SYSTEM = `You are a strict JSON router for a banking demo SPA.
Return ONLY a JSON object (no markdown) with one of:
{"kind":"education","education":{"panel":"login-flow|token-exchange|may-act|mcp-protocol|introspection|agent-gateway|rfc-index|step-up|pingone-authorize|cimd|cua|human-in-loop|langchain","tab":"what"}}
{"kind":"education","ciba":true,"tab":"what"}
{"kind":"banking","banking":{"action":"accounts","params":{}}}
{"kind":"banking","banking":{"action":"balance","params":{}}}
{"kind":"banking","banking":{"action":"balance","params":{"accountId":"chk-xxxxxxxx"}}}
{"kind":"banking","banking":{"action":"deposit","params":{"toId":"checking","amount":100}}}
{"kind":"banking","banking":{"action":"biggest_purchase","params":{}}}
{"kind":"banking","banking":{"action":"spending_summary","params":{}}}
{"kind":"banking","banking":{"action":"mortgage_demo","params":{}}}
{"kind":"none","message":"short hint"}

Pipes in examples (accounts|balance) mean "pick one action" — never output pipe characters or the word "optional" as a field value.
For "check my balance" / "my account balance" use {"action":"balance","params":{}} with empty params — omit accountId unless the user gave a real account id (e.g. chk-…).
For transfer/deposit/withdraw: always extract amount as a number and account types as "checking" or "savings" (never use account IDs or numbers).
Use biggest_purchase for: "biggest purchase", "largest transaction", "most expensive", "highest spend", "what did I spend the most on".
Use spending_summary for: "spending summary", "how much did I spend", "total spending", "breakdown of spending", "where is my money going".
Use mortgage_demo for: "show mortgage data", "show my mortgage", "mortgage", "home loan", "mortgage balance", "mortgage details", "home loan balance", "mortgage payment", "my home loan". This is the Phase 267 Path A demo (api-key disposition through banking_mortgage_service). ALWAYS return params:{} — the route exposes a single fixed record; do not invent loan IDs or amounts.
Examples:
  "transfer 400 from checking to savings" → {"kind":"banking","banking":{"action":"transfer","params":{"fromId":"checking","toId":"savings","amount":400}}}
  "deposit 100 into savings" → {"kind":"banking","banking":{"action":"deposit","params":{"toId":"savings","amount":100}}}
  "withdraw 50 from checking" → {"kind":"banking","banking":{"action":"withdraw","params":{"fromId":"checking","amount":50}}}
  "what's my biggest purchase" → {"kind":"banking","banking":{"action":"biggest_purchase","params":{}}}
  "show me a spending summary" → {"kind":"banking","banking":{"action":"spending_summary","params":{}}}
  "show mortgage data" → {"kind":"banking","banking":{"action":"mortgage_demo","params":{}}}
  "what's my home loan balance" → {"kind":"banking","banking":{"action":"mortgage_demo","params":{}}}
  "search for PingOne token exchange" → {"kind":"banking","banking":{"action":"web_search","query":"PingOne token exchange"}}
  "find information about RFC 8693" → {"kind":"banking","banking":{"action":"web_search","query":"RFC 8693"}}

User wants banking operations OR to open help topics (OAuth, MCP, CIBA, token exchange, CIMD client registration, etc.).
Prefer banking when the user asks to move money or list data; prefer education when they ask how something works.
For CIMD / client-id-metadata / dynamic client registration / register a client / DCR / RFC 7591 → use panel cimd.
For CUA / computer use agent / computer use → use panel cua.
For LangChain / LCEL / multi-provider LLM / model-agnostic / llm orchestration / langchain agent → use panel langchain.
CRITICAL: For ANY request that contains "list", "show", or "get" combined with "mcp tools", "tools available",
"available tools", or the standalone phrases "list tools" / "show tools" → ALWAYS output {"kind":"banking","banking":{"action":"mcp_tools","params":{}}}.
NEVER route these to education — not even if "mcp" appears in the phrase.
Examples of mcp_tools (always banking, never education):
  "list of mcp tools" → {"kind":"banking","banking":{"action":"mcp_tools","params":{}}}
  "show mcp tools"    → {"kind":"banking","banking":{"action":"mcp_tools","params":{}}}
  "what tools are available" → {"kind":"banking","banking":{"action":"mcp_tools","params":{}}}
  "list tools"        → {"kind":"banking","banking":{"action":"mcp_tools","params":{}}}
Only route to education panel mcp-protocol when the user asks HOW MCP works or WHAT MCP is (no list/show/get verb).
If the user asks to pay, transfer, or send money involving a "credit card", "credit account", or "investment account" → {"kind":"none","message":"This demo only supports Checking and Savings accounts. Credit cards and investment accounts are not available."}`;


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
 * @param {string} [provider='auto'] - 'auto' (heuristic→ollama), 'ollama' (skip heuristic), 'helix', etc.
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
  const selectedProvider = provider === 'auto' ? (langchainConfig?.provider || configStore.get('provider') || 'helix') : provider;

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

        if (helixResult) {
          try {
            const cleaned = helixResult.replace(/^```json\s*/i, '').replace(/```\s*$/m, '').trim();
            const parsed = JSON.parse(cleaned);
            if (parsed && typeof parsed === 'object' && parsed.kind && parsed.kind !== 'none') {
              return { source: 'helix', result: parsed };
            }
            // kind:'none' — in LLM-only mode fall through to conversational Helix answer
          } catch (e) {
            console.warn('[nlIntent] Helix JSON parse failed:', e.message);
          }
        }
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
