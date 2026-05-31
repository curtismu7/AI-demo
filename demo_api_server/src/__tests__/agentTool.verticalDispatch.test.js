jest.mock('../../services/verticalManifest', () => ({
  verticalManifest: { resolver: { activeId: () => 'healthcare' } },
}));
jest.mock('../../services/verticalDispatch', () => ({
  resolvePlugin: jest.fn((id) => (id === 'healthcare' ? { getTools: () => [{ name: 'view_coverage' }, { name: 'book_appointment' }] } : null)),
  executeToolFor: jest.fn(async () => ({ result: { plan: 'PPO' }, render: 'view_coverage' })),
}));
const { __test } = require('../../routes/agentTool');

describe('agentTool plugin-tool detection', () => {
  it('identifies a healthcare plugin tool', () => {
    expect(__test.resolvePluginToolOwner('view_coverage')).not.toBeNull();
  });
  it('returns null for a banking/MCP tool not owned by the plugin', () => {
    expect(__test.resolvePluginToolOwner('get_my_accounts')).toBeNull();
  });
});
