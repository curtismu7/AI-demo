import { buildAgent } from '../src/agentFactory';
import { Agent } from '@mastra/core/agent';

jest.mock('@mastra/core/agent', () => {
  return {
    Agent: jest.fn().mockImplementation(() => ({ stream: jest.fn() })),
  };
});

const SCHEMAS = [
  { name: 'get_accounts', description: 'List accounts', inputSchema: { type: 'object' as const, properties: {} } },
];

const RUN_CTX = {
  bffToolUrl: 'http://127.0.0.1:3001/internal/agent-tool',
  bffInternalSecret: 'secret',
  sessionId: 'sess_abc',
};

describe('buildAgent', () => {
  beforeEach(() => {
    (Agent as jest.MockedClass<typeof Agent>).mockClear();
  });

  it('returns an Agent instance', () => {
    const agent = buildAgent(SCHEMAS, RUN_CTX, 'gpt-4o');
    expect(agent).toBeDefined();
  });

  it('constructs Agent with banking-agent id', () => {
    buildAgent(SCHEMAS, RUN_CTX, 'gpt-4o');
    expect(Agent).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'banking-agent' }),
    );
  });

  it('passes custom instructions when provided', () => {
    buildAgent(SCHEMAS, RUN_CTX, 'gpt-4o', 'Custom prompt');
    expect(Agent).toHaveBeenCalledWith(
      expect.objectContaining({ instructions: 'Custom prompt' }),
    );
  });

  it('uses default instructions when none provided', () => {
    buildAgent(SCHEMAS, RUN_CTX, 'gpt-4o');
    const call = (Agent as jest.MockedClass<typeof Agent>).mock.calls[0][0];
    expect(call.instructions).toContain('banking assistant');
  });

  it('includes tool map with schema names as keys', () => {
    buildAgent(SCHEMAS, RUN_CTX, 'gpt-4o');
    const call = (Agent as jest.MockedClass<typeof Agent>).mock.calls[0][0];
    expect(call.tools).toHaveProperty('get_accounts');
  });
});
