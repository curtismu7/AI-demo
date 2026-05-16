// banking_agent_service/src/helixToolAdapter.ts
// Makes Helix (free-text, no native tool-calling) behave like a tool-capable
// model via a TOOL_CALL: sentinel. One strict retry, then HelixUnparseableError.
// Design: docs/superpowers/specs/2026-05-15-agent-consolidation-design.md
import type { ReasonMessage, ReasonToolSchema } from './reasonContract';

export class HelixUnparseableError extends Error {
  constructor(msg: string) { super(msg); this.name = 'HelixUnparseableError'; }
}

export interface HelixModelResult {
  content?: string;
  tool_calls?: Array<{ id: string; name: string; args: Record<string, unknown> }>;
}

type HelixClientFn = (cfg: Record<string, string | undefined>, messages: ReasonMessage[]) => Promise<string>;

function buildSystemPreamble(tools: ReasonToolSchema[]): string {
  const toolLines = tools.map((t) => {
    const fields = Object.keys((t.inputSchema as any)?.properties || {});
    return `- ${t.name} — ${t.description} — args: {${fields.join(', ')}}`;
  }).join('\n');
  return [
    'You can call banking tools. Available tools:',
    toolLines,
    '',
    'RULES:',
    '- If a tool is needed, respond with ONE line and nothing else:',
    '  TOOL_CALL: {"name":"<exact tool name>","args":{...}}',
    '- Otherwise, answer the user normally in plain prose. Do NOT mention tools.',
    '- Never wrap the TOOL_CALL line in code fences or add text around it.',
  ].join('\n');
}

function withPreamble(messages: ReasonMessage[], preamble: string): ReasonMessage[] {
  const out = messages.map((m) => ({ ...m }));
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i].role === 'user') { out[i] = { ...out[i], content: `${preamble}\n\n${out[i].content}` }; return out; }
  }
  out.push({ role: 'user', content: preamble });
  return out;
}

const TOOL_CALL_RE = /^TOOL_CALL:\s*(.+)$/;

function parseHelixResponse(raw: string, toolNames: Set<string>): HelixModelResult | null {
  let s = (raw || '').trim();
  const fence = s.match(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/);
  if (fence) s = fence[1].trim();
  const lines = s.split('\n');
  const toolLine = lines.map((l) => l.trim()).find((l) => TOOL_CALL_RE.test(l));
  if (!toolLine) return { content: s };
  let jsonPart = (toolLine.match(TOOL_CALL_RE) as RegExpMatchArray)[1].trim();
  // Helix often closes a ```json fence on the same line as the JSON; strip any
  // trailing backtick-fence so the common fenced shape parses on the first try
  // (otherwise it is wrongly treated as malformed and forced into a retry).
  jsonPart = jsonPart.replace(/\s*`+\s*$/, '').trim();
  let obj: any;
  try { obj = JSON.parse(jsonPart); } catch { return null; }
  const name = obj?.name;
  const args = obj?.args;
  const argsOk = args && typeof args === 'object' && !Array.isArray(args);
  if (typeof name !== 'string' || !toolNames.has(name) || !argsOk) return null;
  return { tool_calls: [{ id: `helix-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name, args }] };
}

export async function helixReason(
  cfg: Record<string, string | undefined>,
  messages: ReasonMessage[],
  tools: ReasonToolSchema[],
  client: HelixClientFn,
): Promise<HelixModelResult> {
  const toolNames = new Set(tools.map((t) => t.name));
  const preamble = buildSystemPreamble(tools);
  const primed = withPreamble(messages, preamble);

  const first = await client(cfg, primed);
  const parsed = parseHelixResponse(first, toolNames);
  if (parsed) return parsed;

  const corrective: ReasonMessage = {
    role: 'user',
    content: [
      'Your previous response was not valid. You wrote:',
      first.slice(0, 500),
      `Respond with EITHER exactly one line TOOL_CALL: {"name":"...","args":{...}} using one of these exact tool names: ${[...toolNames].join(', ')}`,
      'OR a plain prose answer with no JSON. Nothing else.',
    ].join('\n'),
  };
  const second = await client(cfg, [...primed, corrective]);
  const retryParsed = parseHelixResponse(second, toolNames);
  if (retryParsed) return retryParsed;

  throw new HelixUnparseableError('Helix did not produce a parseable response after one retry');
}
