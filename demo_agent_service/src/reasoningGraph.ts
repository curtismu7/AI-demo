// banking_agent_service/src/reasoningGraph.ts
// One reasoning step (the BFF drives the loop). Ollama = native bindTools;
// Helix = helixToolAdapter (sentinel); Anthropic = native tool_use.
// Reasoning-only: NEVER executes a tool, NEVER touches a token.
// Helix/Anthropic failure → reasoningUnavailable (BFF applies the
// heuristic floor — ARCHITECTURE-TRUTHS T-3).
import Anthropic from '@anthropic-ai/sdk';
import { ChatOllama } from '@langchain/ollama';
import type { ReasonRequest, ReasonResponse, ReasonMessage } from './reasonContract';
import { helixReason, HelixUnparseableError } from './helixToolAdapter';
import { callHelix } from './helixClient';
import { teachLog } from './teachLogger';

// Map our internal ReasonMessage[] to Anthropic's MessageParam[].
// Tool results in our format: { role:'tool', content:'...', tool_call_id:'...' }
// Anthropic format: { role:'user', content:[{ type:'tool_result', tool_use_id, content }] }
function toAnthropicMessages(messages: ReasonMessage[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  let i = 0;
  while (i < messages.length) {
    const msg = messages[i];
    if (msg.role === 'tool') {
      // Collect consecutive tool results into a single user turn
      const results: Anthropic.ToolResultBlockParam[] = [];
      while (i < messages.length && messages[i].role === 'tool') {
        const m = messages[i];
        results.push({
          type: 'tool_result',
          tool_use_id: m.tool_call_id ?? '',
          content: m.content,
        });
        i++;
      }
      out.push({ role: 'user', content: results });
    } else if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
      // Assistant turn that contains tool_use blocks
      const blocks: Anthropic.ContentBlockParam[] = [];
      if (msg.content) blocks.push({ type: 'text', text: msg.content });
      for (const tc of msg.tool_calls) {
        blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.args });
      }
      out.push({ role: 'assistant', content: blocks });
      i++;
    } else {
      out.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
      i++;
    }
  }
  return out;
}

const DEFAULT_MODELS: Record<string, string> = {
  ollama: 'llama3.2',
  helix: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-4-6',
};

export async function reasonOnce(req: ReasonRequest): Promise<ReasonResponse> {
  if (req.provider === 'anthropic') {
    const apiKey = req.anthropicApiKey || process.env.ANTHROPIC_API_KEY || '';
    if (!apiKey) {
      teachLog.error('Anthropic API key missing', null, { operation: 'reasonOnce' });
      return { type: 'final', answer: '', messages: req.messages, reasoningUnavailable: true };
    }
    try {
      const client = new Anthropic({ apiKey });
      const model = req.model || DEFAULT_MODELS.anthropic;
      const tools: Anthropic.Tool[] = req.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema as Anthropic.Tool['input_schema'],
      }));
      const anthropicMessages = toAnthropicMessages(req.messages);
      const response = await client.messages.create({
        model,
        max_tokens: 4096,
        tools,
        messages: anthropicMessages,
      });
      if (response.stop_reason === 'tool_use') {
        const toolUseBlocks = response.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
        );
        const calls = toolUseBlocks.map((b) => ({ id: b.id, name: b.name, args: b.input as Record<string, unknown> }));
        const assistantMsg: ReasonMessage = {
          role: 'assistant',
          content: (response.content.find((b) => b.type === 'text') as Anthropic.TextBlock | undefined)?.text ?? '',
          tool_calls: calls,
        };
        return { type: 'tool_calls', calls, messages: [...req.messages, assistantMsg] };
      }
      const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
      const answer = textBlock?.text ?? '';
      return {
        type: 'final',
        answer,
        messages: [...req.messages, { role: 'assistant', content: answer }],
        inputTokens: response.usage?.input_tokens,
        outputTokens: response.usage?.output_tokens,
      };
    } catch (err) {
      teachLog.error('Anthropic reasoning step failed', err, { operation: 'reasonOnce' });
      return { type: 'final', answer: '', messages: req.messages, reasoningUnavailable: true };
    }
  }

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
      teachLog.error('reasoning step failed', err, { operation: 'reasonOnce' });
      teachLog.info('reasoning unavailable — BFF heuristic floor will apply', { reason: note });
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
