// banking_api_server/services/agentReasoningClient.js
// BFF drives the reason loop and EXECUTES tools (token custody + HITL stay
// here). :3006 only proposes tool calls / returns a final answer. On
// reasoningUnavailable or transport failure → signal heuristic-fallback
// (ARCHITECTURE-TRUTHS T-3 floor). Recursion cap enforced here.
const axios = require('axios');

const REASON_URL =
  (process.env.AGENT_SERVICE_URL || 'http://localhost:3006') + '/api/agent/reason';

async function runReasonLoop(p) {
  const secret = process.env.BFF_INTERNAL_SECRET || '';
  let messages = p.messages;
  for (let i = 0; i < p.maxIterations; i++) {
    let resp;
    try {
      resp = await axios.post(
        REASON_URL,
        { messages, tools: p.tools, provider: p.provider, model: p.model, helixConfig: p.helixConfig, ollamaBaseUrl: p.ollamaBaseUrl },
        { headers: { 'x-internal-gateway-secret': secret }, timeout: 70000 },
      );
    } catch (err) {
      return { ok: false, reason: 'reasoning_unavailable' };
    }
    const data = resp.data;
    if (data.type === 'final') {
      if (data.reasoningUnavailable) return { ok: false, reason: 'reasoning_unavailable' };
      return { ok: true, answer: data.answer };
    }
    if (data.type === 'tool_calls') {
      const toolMessages = [];
      for (const call of data.calls) {
        const result = await p.executeTool(call.name, call.args);
        toolMessages.push({ role: 'tool', content: typeof result === 'string' ? result : JSON.stringify(result), tool_call_id: call.id });
      }
      messages = [...(data.messages || messages), ...toolMessages];
      continue;
    }
    return { ok: false, reason: 'reasoning_unavailable' };
  }
  return { ok: false, reason: 'max_iterations' };
}

module.exports = { runReasonLoop };
