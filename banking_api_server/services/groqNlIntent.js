// banking_api_server/services/groqNlIntent.js
/**
 * Groq LLM intent parsing using the OpenAI-compatible API.
 * Activated when GROQ_API_KEY is set. Fast inference with llama-3.1-8b-instant (free tier).
 * Falls back gracefully if unset or on error.
 */
'use strict';

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

const SYSTEM = `You are a strict JSON router for a banking demo SPA.
Return ONLY a JSON object (no markdown, no explanation) with one of:
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
 * @returns {Promise<object|null>} parsed intent object or null to fall through to next parser
 */
async function parseWithGroq(userMessage, context = {}) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;

  const systemWithCtx = context.role
    ? `${SYSTEM}\n\nSigned-in user: role=${context.role}${context.firstName ? ', name=' + context.firstName : ''}. ${
        context.role === 'admin'
          ? 'Admin users can query ALL accounts and transactions system-wide, not just their own.'
          : 'This is a regular customer — banking actions apply to their own accounts only.'
      }`
    : SYSTEM;

  const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemWithCtx },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.1,
      max_tokens: 256,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.warn('[groqNlIntent] Groq HTTP', res.status, errText.slice(0, 200));
    return null;
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) return null;

  try {
    const parsed = JSON.parse(text.trim());
    if (parsed && typeof parsed === 'object' && parsed.kind) return parsed;
  } catch (e) {
    console.warn('[groqNlIntent] JSON parse failed:', e.message, '— raw:', text.slice(0, 100));
  }
  return null;
}

module.exports = { parseWithGroq, MODEL };
