const { REQUIRED_METHODS, validatePlugin } = require('../../services/verticalManifest/pluginContract');

describe('plugin contract', () => {
  const goodPlugin = {
    getManifest: () => ({ id: 'x' }),
    getTools: () => [{ name: 't', description: 'd', inputSchema: { type: 'object' }, scopes: ['read'], authz: {} }],
    getHeuristics: () => [{ re: /foo/, action: 't' }],
    getSystemPrompt: () => 'prompt',
    getDataStore: () => ({}),
    executeTool: async () => ({ result: {}, render: null }),
    getAuthz: () => ({ t: {} }),
  };

  it('lists every required method', () => {
    expect(REQUIRED_METHODS).toEqual([
      'getManifest', 'getTools', 'getHeuristics', 'getSystemPrompt',
      'getDataStore', 'executeTool', 'getAuthz',
    ]);
  });

  it('accepts a fully-formed plugin', () => {
    expect(validatePlugin('x', goodPlugin)).toEqual({ ok: true, errors: [] });
  });

  it('rejects a plugin missing a method', () => {
    const bad = { ...goodPlugin };
    delete bad.executeTool;
    const res = validatePlugin('x', bad);
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toMatch(/executeTool/);
  });

  it('rejects a heuristic action not present in getTools', () => {
    const bad = { ...goodPlugin, getHeuristics: () => [{ re: /foo/, action: 'not_a_tool' }] };
    const res = validatePlugin('x', bad);
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toMatch(/not_a_tool/);
  });
});
