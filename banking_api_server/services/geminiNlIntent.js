// banking_api_server/services/geminiNlIntent.js
/**
 * LLM intent parsing — priority: Groq → Gemini → heuristic regex.
 * Set GROQ_API_KEY for fastest inference; GEMINI_API_KEY as fallback; neither = free heuristic.
 */
'use strict';

const { parseHeuristic, EDU } = require('./nlIntentParser');
const { parseWithGroq } = require('./groqNlIntent');
const { sanitizeNlResult } = require('./nlIntentSanitize');

const MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

const SYSTEM = `You are a strict JSON router for a banking demo SPA.
Return ONLY a JSON object (no markdown) with one of:
{"kind":"education","education":{"panel":"login-flow|token-exchange|may-act|mcp-protocol|introspection|agent-gateway|rfc-index|step-up|pingone-authorize|cimd","tab":"optional tab id"}}
{"kind":"education","ciba":true,"tab":"what"}
{"kind":"banking","banking":{"action":"accounts|transactions|balance|deposit|withdraw|transfer|logout|mcp_tools","params":{"accountId":"optional","fromId":"checking|savings","toId":"checking|savings","amount":0,"note":""}}}
{"kind":"none","message":"short hint"}

For transfer/deposit/withdraw: always extract amount as a number and account types as "checking" or "savings" (never use account IDs or numbers).
Examples:
  "transfer 400 from checking to savings" → {"kind":"banking","banking":{"action":"transfer","params":{"fromId":"checking","toId":"savings","amount":400}}}
  "deposit 100 into savings" → {"kind":"banking","banking":{"action":"deposit","params":{"toId":"savings","amount":100}}}
  "withdraw 50 from checking" → {"kind":"banking","banking":{"action":"withdraw","params":{"fromId":"checking","amount":50}}}

User wants banking operations OR to open help topics (OAuth, MCP, CIBA, token exchange, CIMD client registration, etc.).
Prefer banking when the user asks to move money or list data; prefer education when they ask how something works.
For CIMD / client-id-metadata / dynamic client registration / register a client / DCR / RFC 7591 → use panel cimd.
For "list tools", "show MCP tools", "what tools are available" → use action mcp_tools.`;

/**
 * @param {string} userMessage
 * @param {{ role?: string, firstName?: string }} [context]
 * @returns {Promise<object|null>} parsed result object or null to use heuristic
 */
async function parseWithGemini(userMessage, context = {}) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!key) return null;

  const systemWithCtx = context.role
    ? `${SYSTEM}\n\nSigned-in user: role=${context.role}${context.firstName ? ', name=' + context.firstName : ''}. ${
        context.role === 'admin'
          ? 'Admin users can query ALL accounts and transactions system-wide, not just their own.'
          : 'This is a regular customer — banking actions apply to their own accounts only.'
      }`
    : SYSTEM;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    systemInstruction: { parts: [{ text: systemWithCtx }] },
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 512,
      responseMimeType: 'application/json',
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.warn('[geminiNlIntent] Gemini HTTP', res.status, errText.slice(0, 200));
    return null;
  }

  const data = await res.json();
  let text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return null;
  text = text.replace(/^```json\s*/i, '').replace(/```\s*$/m, '').trim();

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && parsed.kind) return parsed;
  } catch (e) {
    console.warn('[geminiNlIntent] JSON parse failed', e.message);
  }
  return null;
}

/**
 * @param {string} message
 * @param {{ role?: string, firstName?: string }} [context] - user context for role-aware routing
 * @returns {Promise<{ source: 'groq'|'gemini'|'heuristic', result: object }>}
 */
async function parseNaturalLanguage(message, context = {}) {
  // 1. Try Groq (fastest, OpenAI-compatible)
  const groq = await parseWithGroq(message, context).catch((e) => {
    console.warn('[nlIntent] Groq error:', e.message);
    return null;
  });
  if (groq) {
    const { result, rejected, reason } = sanitizeNlResult(groq, message);
    if (rejected) console.warn('[nlIntent] Groq output rejected → heuristic:', reason);
    return { source: rejected ? 'heuristic' : 'groq', result };
  }

  // 2. Try Gemini
  const gemini = await parseWithGemini(message, context).catch((e) => {
    console.warn('[nlIntent] Gemini error:', e.message);
    return null;
  });
  if (gemini) {
    const { result, rejected, reason } = sanitizeNlResult(gemini, message);
    if (rejected) console.warn('[nlIntent] Gemini output rejected → heuristic:', reason);
    return { source: rejected ? 'heuristic' : 'gemini', result };
  }

  // 3. Heuristic regex (always available, zero cost)
  return { source: 'heuristic', result: parseHeuristic(message) };
}

module.exports = {
  parseNaturalLanguage,
  EDU,
};
