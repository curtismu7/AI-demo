import { buildBffTools, BffToolError } from '../src/bffToolAdapter';

const SCHEMA = {
  name: 'get_accounts',
  description: 'List accounts',
  inputSchema: { type: 'object' as const, properties: { userId: { type: 'string' } } },
};

const RUN_CTX = {
  bffToolUrl: 'http://127.0.0.1:3001/internal/agent-tool',
  bffInternalSecret: 'secret',
  sessionId: 'sess_abc',
};

describe('buildBffTools', () => {
  it('returns one tool per schema', () => {
    const tools = buildBffTools([SCHEMA], RUN_CTX);
    expect(tools).toHaveLength(1);
  });

  it('tool has correct id and description', () => {
    const tools = buildBffTools([SCHEMA], RUN_CTX);
    expect(tools[0].id).toBe('get_accounts');
    expect(tools[0].description).toBe('List accounts');
  });

  it('tool execute calls BFF and returns result', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: { accounts: [] } }),
    } as any);

    const tools = buildBffTools([SCHEMA], RUN_CTX);
    const exec = tools[0].execute!;
    const result = await exec({ userId: 'u1' }, {} as any);
    expect(result).toEqual({ accounts: [] });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:3001/internal/agent-tool',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('tool execute throws BffToolError on non-ok response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'internal error',
    } as any);

    const tools = buildBffTools([SCHEMA], RUN_CTX);
    const exec = tools[0].execute!;
    await expect(exec({ userId: 'u1' }, {} as any)).rejects.toThrow(BffToolError);
  });
});
