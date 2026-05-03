// banking_api_server/services/geminiNlIntent.js
/**
 * Intent parsing — priority: HEURISTIC (instant) → Ollama (local LLM fallback).
 * Heuristic handles all known commands (accounts, balance, transfer, education topics) with zero latency.
 * Ollama is only called when heuristic returns kind:'none' (unrecognized input).
 */
'use strict';

const { parseHeuristic, EDU } = require('./nlIntentParser');
const { sanitizeNlResult } = require('./nlIntentSanitize');

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
{"kind":"none","message":"short hint"}

Pipes in examples (accounts|balance) mean "pick one action" — never output pipe characters or the word "optional" as a field value.
For "check my balance" / "my account balance" use {"action":"balance","params":{}} with empty params — omit accountId unless the user gave a real account id (e.g. chk-…).
For transfer/deposit/withdraw: always extract amount as a number and account types as "checking" or "savings" (never use account IDs or numbers).
Examples:
  "transfer 400 from checking to savings" → {"kind":"banking","banking":{"action":"transfer","params":{"fromId":"checking","toId":"savings","amount":400}}}
  "deposit 100 into savings" → {"kind":"banking","banking":{"action":"deposit","params":{"toId":"savings","amount":100}}}
  "withdraw 50 from checking" → {"kind":"banking","banking":{"action":"withdraw","params":{"fromId":"checking","amount":50}}}
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
  // 1. HEURISTIC FIRST — regex patterns for known banking actions (zero latency)
  const heuristicResult = parseHeuristic(message);
  if (heuristicResult && heuristicResult.kind !== 'none') {
    return { source: 'heuristic', result: heuristicResult };
  }

  // 2. FALLBACK TO LLM — when heuristic doesn't recognize the input
  // Use configured provider (Helix, Ollama, etc.) based on langchainConfig
  const selectedProvider = provider === 'auto' ? (langchainConfig?.provider || 'ollama') : provider;

  if (selectedProvider === 'helix') {
    // TODO: Implement Helix LLM routing once real API call is added to helixLlmService
    console.log('[nlIntent] Helix routing not yet implemented (stub only); falling back to heuristic');
    return { source: 'heuristic', result: heuristicResult };
  }

  // Default to Ollama (local LLM)
  const ollama = await parseWithOllama(message, context).catch((e) => {
    console.warn('[nlIntent] Ollama error:', e.message);
    return null;
  });
  if (ollama) {
    const { result, rejected, reason } = sanitizeNlResult(ollama, message);
    if (rejected) console.warn('[nlIntent] Ollama output rejected → heuristic:', reason);
    return { source: rejected ? 'heuristic' : 'ollama', result };
  }

  // 3. Final fallback: heuristic returns kind:'none' (unrecognized input, LLM unavailable)
  return { source: 'heuristic', result: heuristicResult };
}

module.exports = {
  parseNaturalLanguage,
  EDU,
};
