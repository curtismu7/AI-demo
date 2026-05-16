// banking_agent_service/tests/helixToolAdapter.test.ts
import { helixReason, HelixUnparseableError } from '../src/helixToolAdapter';
import type { ReasonToolSchema, ReasonMessage } from '../src/reasonContract';

const TOOLS: ReasonToolSchema[] = [
  { name: 'get_my_transactions', description: 'list txns', inputSchema: { type: 'object', properties: {} } },
];
const MSGS: ReasonMessage[] = [{ role: 'user', content: 'show my transactions' }];
const CFG = {};

function fakeClient(responses: string[]) {
  let i = 0;
  const calls: any[] = [];
  const fn = async (_cfg: any, msgs: ReasonMessage[]) => { calls.push(msgs); return responses[i++]; };
  return { fn, calls };
}

describe('helixReason — sentinel tool-call adapter', () => {
  test('plain prose → content (the ~50% conversational case)', async () => {
    const { fn } = fakeClient(['Your balance is healthy. Anything else?']);
    const out = await helixReason(CFG, MSGS, TOOLS, fn);
    expect(out).toEqual({ content: 'Your balance is healthy. Anything else?' });
  });

  test('clean TOOL_CALL line → tool_calls', async () => {
    const { fn } = fakeClient(['TOOL_CALL: {"name":"get_my_transactions","args":{}}']);
    const out = await helixReason(CFG, MSGS, TOOLS, fn);
    expect(out.tool_calls?.[0].name).toBe('get_my_transactions');
    expect(out.tool_calls?.[0].args).toEqual({});
    expect(typeof out.tool_calls?.[0].id).toBe('string');
  });

  test('TOOL_CALL wrapped in code fences + preamble still parses', async () => {
    const { fn } = fakeClient(['Sure!\n```\nTOOL_CALL: {"name":"get_my_transactions","args":{}}\n```']);
    const out = await helixReason(CFG, MSGS, TOOLS, fn);
    expect(out.tool_calls?.[0].name).toBe('get_my_transactions');
  });

  test('```json fence closed on the same line as JSON parses on first try (no retry)', async () => {
    const { fn, calls } = fakeClient([
      '```json\nTOOL_CALL: {"name":"get_my_transactions","args":{}}```',
    ]);
    const out = await helixReason(CFG, MSGS, TOOLS, fn);
    expect(out.tool_calls?.[0].name).toBe('get_my_transactions');
    expect(calls.length).toBe(1); // parsed first attempt — NO retry
  });

  test('prose containing a JSON example does NOT false-positive', async () => {
    const { fn } = fakeClient(['An access token looks like {"sub":"abc","scope":"banking:read"} — no action needed.']);
    const out = await helixReason(CFG, MSGS, TOOLS, fn);
    expect(out.content).toContain('access token looks like');
    expect(out.tool_calls).toBeUndefined();
  });

  test('unknown tool name → retry → recovered', async () => {
    const { fn, calls } = fakeClient([
      'TOOL_CALL: {"name":"hallucinated_tool","args":{}}',
      'TOOL_CALL: {"name":"get_my_transactions","args":{}}',
    ]);
    const out = await helixReason(CFG, MSGS, TOOLS, fn);
    expect(out.tool_calls?.[0].name).toBe('get_my_transactions');
    expect(calls.length).toBe(2);
  });

  test('malformed JSON → retry → still malformed → throws HelixUnparseableError', async () => {
    const { fn, calls } = fakeClient([
      'TOOL_CALL: {not json',
      'TOOL_CALL: still {not} json',
    ]);
    await expect(helixReason(CFG, MSGS, TOOLS, fn)).rejects.toBeInstanceOf(HelixUnparseableError);
    expect(calls.length).toBe(2);
  });

  test('retry returns prose → treated as content (valid)', async () => {
    const { fn, calls } = fakeClient([
      'TOOL_CALL: {bad',
      'On reflection, your balance is fine.',
    ]);
    const out = await helixReason(CFG, MSGS, TOOLS, fn);
    expect(out.content).toBe('On reflection, your balance is fine.');
    expect(calls.length).toBe(2);
  });
});
