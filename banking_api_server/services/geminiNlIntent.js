// banking_api_server/services/geminiNlIntent.js
/**
 * Intent parsing — priority: HEURISTIC (instant) → LM Studio → Groq → Anthropic (fallback).
 * Heuristic handles all known commands (accounts, balance, transfer, education topics) with zero latency.
 * LLM is only called when heuristic returns kind:'none' (unrecognized input).
 * Set LM_STUDIO_BASE_URL for local inference; GROQ_API_KEY for cloud; ANTHROPIC_API_KEY as fallback; neither = free heuristic only.
 */
'use strict';

const { parseHeuristic, EDU } = require('./nlIntentParser');
const { parseWithGroq } = require('./groqNlIntent');
const { sanitizeNlResult } = require('./nlIntentSanitize');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-20250414';
const ANTHROPIC_TIMEOUT_MS = 10000;

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

const LM_STUDIO_BASE_URL = process.env.LM_STUDIO_BASE_URL || '';
const LM_STUDIO_MODEL = process.env.LM_STUDIO_MODEL || 'gemma-4-4b';
const LM_STUDIO_TIMEOUT_MS = 5000;

/**
 * @param {string} userMessage
 * @param {{ role?: string, firstName?: string }} [context]
 * @returns {Promise<object|null>} parsed intent or null to fall through
 */
async function parseWithLmStudio(userMessage, context = {}) {
  if (!LM_STUDIO_BASE_URL) return null;

  const systemWithCtx = context.role
    ? `${SYSTEM}\n\nSigned-in user: role=${context.role}${context.firstName ? ', name=' + context.firstName : ''}. ${
        context.role === 'admin'
          ? 'Admin users can query ALL accounts and transactions system-wide, not just their own.'
          : 'This is a regular customer \u2014 banking actions apply to their own accounts only.'
      }`
    : SYSTEM;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LM_STUDIO_TIMEOUT_MS);

  try {
    const body = {
      messages: [
        { role: 'system', content: systemWithCtx },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.1,
      max_tokens: 256,
      response_format: { type: 'json_object' },
    };
    if (LM_STUDIO_MODEL) body.model = LM_STUDIO_MODEL;

    const res = await fetch(`${LM_STUDIO_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn('[lmStudioNlIntent] LM Studio HTTP', res.status);
      return null;
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) return null;

    const parsed = JSON.parse(text.trim());
    if (parsed && typeof parsed === 'object' && parsed.kind) return parsed;
  } catch (e) {
    if (e.name === 'AbortError') {
      console.warn('[lmStudioNlIntent] LM Studio timeout (%dms) \u2014 skipping', LM_STUDIO_TIMEOUT_MS);
    } else {
      console.warn('[lmStudioNlIntent] LM Studio error:', e.message);
    }
  } finally {
    clearTimeout(timeout);
  }
  return null;
}

/**
 * @param {string} userMessage
 * @param {{ role?: string, firstName?: string }} [context]
 * @returns {Promise<object|null>} parsed result object or null to fall through
 */
async function parseWithAnthropic(userMessage, context = {}) {
  if (!ANTHROPIC_API_KEY) return null;

  const systemWithCtx = context.role
    ? `${SYSTEM}\n\nSigned-in user: role=${context.role}${context.firstName ? ', name=' + context.firstName : ''}. ${
        context.role === 'admin'
          ? 'Admin users can query ALL accounts and transactions system-wide, not just their own.'
          : 'This is a regular customer \u2014 banking actions apply to their own accounts only.'
      }`
    : SYSTEM;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ANTHROPIC_TIMEOUT_MS);

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 256,
        system: systemWithCtx,
        messages: [{ role: 'user', content: userMessage }],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn('[nlIntent] Anthropic HTTP', res.status, errText.slice(0, 200));
      return null;
    }

    const data = await res.json();
    let text = data?.content?.[0]?.text;
    if (!text) return null;
    text = text.replace(/^```json\s*/i, '').replace(/```\s*$/m, '').trim();

    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && parsed.kind) return parsed;
  } catch (e) {
    if (e.name === 'AbortError') {
      console.warn('[nlIntent] Anthropic timeout (%dms) \u2014 skipping', ANTHROPIC_TIMEOUT_MS);
    } else {
      console.warn('[nlIntent] Anthropic error:', e.message);
    }
  } finally {
    clearTimeout(timeout);
  }
  return null;
}

/**
 * @param {string} message
 * @param {{ role?: string, firstName?: string }} [context] - user context for role-aware routing
 * @returns {Promise<{ source: 'lmstudio'|'groq'|'anthropic'|'heuristic', result: object }>}
 */
async function parseNaturalLanguage(message, context = {}) {
  // Heuristic-first routing: handles all recognized commands instantly (zero cost, zero latency).
  // LLM is only attempted when heuristic returns kind:'none' (unrecognized input).
  
  // 1. Heuristic first — instant, zero-cost, handles all known intents
  const heuristicResult = parseHeuristic(message);
  if (heuristicResult && heuristicResult.kind !== 'none') {
    return { source: 'heuristic', result: heuristicResult };
  }

  // 2. Try LM Studio (local, fastest when running) — only for unrecognized input
  const lmStudio = await parseWithLmStudio(message, context).catch((e) => {
    console.warn('[nlIntent] LM Studio error:', e.message);
    return null;
  });
  if (lmStudio) {
    const { result, rejected, reason } = sanitizeNlResult(lmStudio, message);
    if (rejected) console.warn('[nlIntent] LM Studio output rejected → heuristic:', reason);
    return { source: rejected ? 'heuristic' : 'lmstudio', result };
  }

  // 3. Try Groq (cloud, OpenAI-compatible)
  const groq = await parseWithGroq(message, context).catch((e) => {
    console.warn('[nlIntent] Groq error:', e.message);
    return null;
  });
  if (groq) {
    const { result, rejected, reason } = sanitizeNlResult(groq, message);
    if (rejected) console.warn('[nlIntent] Groq output rejected → heuristic:', reason);
    return { source: rejected ? 'heuristic' : 'groq', result };
  }

  // 4. Try Anthropic (cloud fallback)
  const anthropic = await parseWithAnthropic(message, context).catch((e) => {
    console.warn('[nlIntent] Anthropic error:', e.message);
    return null;
  });
  if (anthropic) {
    const { result, rejected, reason } = sanitizeNlResult(anthropic, message);
    if (rejected) console.warn('[nlIntent] Anthropic output rejected → heuristic:', reason);
    return { source: rejected ? 'heuristic' : 'anthropic', result };
  }

  // 5. Final fallback: heuristic returns kind:'none' (unrecognized)
  return { source: 'heuristic', result: heuristicResult };
}

module.exports = {
  parseNaturalLanguage,
  EDU,
};
