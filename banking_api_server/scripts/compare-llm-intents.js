#!/usr/bin/env node
/**
 * LLM Intent Comparison Script
 *
 * Sends banking/education intents through Local (Ollama/LM Studio), Groq, and
 * Anthropic providers and compares accuracy + timing.
 *
 * Usage: node banking_api_server/scripts/compare-llm-intents.js
 *
 * Env vars:
 *   LM_STUDIO_BASE_URL  — local endpoint (default: http://localhost:1234/v1)
 *   LM_STUDIO_MODEL     — model name (default: gemma-4-4b)
 *   GROQ_API_KEY        — Groq cloud key (skip if unset)
 *   ANTHROPIC_API_KEY   — Anthropic key (skip if unset)
 */
'use strict';

const LM_STUDIO_BASE_URL = process.env.LM_STUDIO_BASE_URL || 'http://localhost:1234/v1';
const LM_STUDIO_MODEL = process.env.LM_STUDIO_MODEL || 'gemma-4-4b';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-20250414';

const SYSTEM = `You are a strict JSON router for a banking demo SPA.
Return ONLY a JSON object (no markdown) with one of:
{"kind":"education","education":{"panel":"login-flow|token-exchange|may-act|mcp-protocol|introspection|agent-gateway|rfc-index|step-up|pingone-authorize|cimd|human-in-loop|langchain","tab":"what"}}
{"kind":"education","ciba":true,"tab":"what"}
{"kind":"banking","banking":{"action":"accounts","params":{}}}
{"kind":"banking","banking":{"action":"balance","params":{}}}
{"kind":"banking","banking":{"action":"deposit","params":{"toId":"checking","amount":100}}}
{"kind":"banking","banking":{"action":"mcp_tools","params":{}}}
{"kind":"none","message":"short hint"}
User wants banking operations OR to open help topics.`;

const TEST_INTENTS = [
  { input: 'check my balance', expected: { kind: 'banking', action: 'balance' } },
  { input: 'transfer 100 from checking to savings', expected: { kind: 'banking', action: 'transfer' } },
  { input: 'deposit 50 into savings', expected: { kind: 'banking', action: 'deposit' } },
  { input: 'show me token exchange', expected: { kind: 'education', panel: 'token-exchange' } },
  { input: 'what is CIBA?', expected: { kind: 'education', ciba: true } },
  { input: 'list mcp tools', expected: { kind: 'banking', action: 'mcp_tools' } },
  { input: 'withdraw 25 from checking', expected: { kind: 'banking', action: 'withdraw' } },
  { input: 'how does MCP work?', expected: { kind: 'education', panel: 'mcp-protocol' } },
  { input: 'what are my accounts?', expected: { kind: 'banking', action: 'accounts' } },
];

function matches(result, expected) {
  if (!result || result.kind !== expected.kind) return false;
  if (expected.kind === 'banking') {
    return result.banking?.action === expected.action;
  }
  if (expected.kind === 'education') {
    if (expected.ciba) return !!result.ciba;
    return result.education?.panel === expected.panel;
  }
  return true;
}

async function callLocal(message) {
  const body = {
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: message },
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
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  return text ? JSON.parse(text.trim()) : null;
}

async function callGroq(message) {
  if (!GROQ_API_KEY) return null;
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: message },
      ],
      temperature: 0.1,
      max_tokens: 256,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  return text ? JSON.parse(text.trim()) : null;
}

async function callAnthropic(message) {
  if (!ANTHROPIC_API_KEY) return null;
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
      system: SYSTEM,
      messages: [{ role: 'user', content: message }],
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  let text = data?.content?.[0]?.text;
  if (!text) return null;
  text = text.replace(/^```json\s*/i, '').replace(/```\s*$/m, '').trim();
  return JSON.parse(text);
}

async function timeCall(fn, message) {
  const start = Date.now();
  try {
    const result = await fn(message);
    return { result, ms: Date.now() - start };
  } catch {
    return { result: null, ms: Date.now() - start };
  }
}

async function main() {
  const providers = [
    { name: 'Local', fn: callLocal, available: !!LM_STUDIO_BASE_URL },
    { name: 'Groq', fn: callGroq, available: !!GROQ_API_KEY },
    { name: 'Anthropic', fn: callAnthropic, available: !!ANTHROPIC_API_KEY },
  ];

  // Check local availability
  if (LM_STUDIO_BASE_URL) {
    try {
      await fetch(`${LM_STUDIO_BASE_URL}/models`, { signal: AbortSignal.timeout(2000) });
    } catch {
      providers[0].available = false;
      console.log(`⚠ Local server not reachable at ${LM_STUDIO_BASE_URL} — skipping\n`);
    }
  }

  const active = providers.filter(p => p.available);
  if (active.length === 0) {
    console.log('No providers available. Set LM_STUDIO_BASE_URL, GROQ_API_KEY, or ANTHROPIC_API_KEY.');
    process.exit(0);
  }

  console.log(`\nProviders: ${active.map(p => p.name).join(', ')}`);
  console.log(`Model (Local): ${LM_STUDIO_MODEL || '(default)'}`);
  console.log(`Intents: ${TEST_INTENTS.length}\n`);

  const pad = (s, n) => String(s).padEnd(n);
  const hdr = [pad('Intent', 40)];
  for (const p of active) hdr.push(pad(`${p.name} (ms)`, 18));
  console.log(hdr.join(' | '));
  console.log('-'.repeat(hdr.join(' | ').length));

  const scores = Object.fromEntries(active.map(p => [p.name, 0]));

  for (const { input, expected } of TEST_INTENTS) {
    const row = [pad(input.length > 38 ? input.slice(0, 35) + '...' : input, 40)];

    for (const p of active) {
      const { result, ms } = await timeCall(p.fn, input);
      const ok = matches(result, expected);
      if (ok) scores[p.name]++;
      row.push(pad(`${ms} ${ok ? '✓' : '✗'}`, 18));
    }
    console.log(row.join(' | '));
  }

  console.log('-'.repeat(hdr.join(' | ').length));
  const accRow = [pad('Accuracy', 40)];
  for (const p of active) {
    accRow.push(pad(`${scores[p.name]}/${TEST_INTENTS.length}`, 18));
  }
  console.log(accRow.join(' | '));
  console.log();
}

main().catch(e => {
  console.error('Script error:', e.message);
  process.exit(0);
});
