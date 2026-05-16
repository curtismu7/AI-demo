// banking_agent_service/src/reasoningGraph.ts
// One reasoning step (the BFF drives the loop). Ollama = native bindTools;
// Helix = helixToolAdapter (sentinel). Reasoning-only: NEVER executes a tool,
// NEVER touches a token. Helix failure → reasoningUnavailable (BFF applies the
// heuristic floor — ARCHITECTURE-TRUTHS T-3).
import { ChatOllama } from '@langchain/ollama';
import type { ReasonRequest, ReasonResponse } from './reasonContract';
import { helixReason, HelixUnparseableError } from './helixToolAdapter';
import { callHelix } from './helixClient';

const DEFAULT_MODELS: Record<string, string> = { ollama: 'llama3.2', helix: 'gpt-4o-mini' };

export async function reasonOnce(req: ReasonRequest): Promise<ReasonResponse> {
  if (req.provider === 'helix') {
    try {
      const r = await helixReason(req.helixConfig || {}, req.messages, req.tools, callHelix);
      if (r.tool_calls && r.tool_calls.length > 0) {
        return { type: 'tool_calls', calls: r.tool_calls, messages: [...req.messages, { role: 'assistant', content: '', tool_calls: r.tool_calls }] };
      }
      const answer = r.content ?? '';
      return { type: 'final', answer, messages: [...req.messages, { role: 'assistant', content: answer }] };
    } catch (err) {
      // HelixUnparseableError OR any transport error → signal, do not fabricate.
      const note = err instanceof HelixUnparseableError ? 'helix_unparseable' : 'helix_error';
      console.warn(`[reasoningGraph] helix reasoning unavailable (${note}):`, err instanceof Error ? err.message : String(err));
      return { type: 'final', answer: '', messages: req.messages, reasoningUnavailable: true };
    }
  }

  // Ollama — native tool-calling.
  const baseUrl = req.ollamaBaseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const model = new ChatOllama({ model: req.model || DEFAULT_MODELS.ollama, temperature: 0.7, baseUrl });
  const bound = (model as any).bindTools(req.tools.map((t) => ({
    name: t.name, description: t.description, input_schema: t.inputSchema,
  })));
  const resp: any = await bound.invoke(req.messages);
  if (resp.tool_calls && resp.tool_calls.length > 0) {
    return {
      type: 'tool_calls',
      calls: resp.tool_calls.map((tc: any) => ({ id: tc.id, name: tc.name, args: tc.args || {} })),
      messages: [...req.messages, { role: 'assistant', content: resp.content || '', tool_calls: resp.tool_calls.map((tc: any) => ({ id: tc.id, name: tc.name, args: tc.args || {} })) }],
    };
  }
  const answer = typeof resp.content === 'string' ? resp.content : JSON.stringify(resp.content ?? '');
  return { type: 'final', answer, messages: [...req.messages, { role: 'assistant', content: answer }] };
}
