const HEALTHCARE_WRITE_TOOLS = [
  {
    name: 'book_appointment',
    description: 'Book a new appointment with a provider.',
    inputSchema: {
      type: 'object',
      properties: { provider: { type: 'string' }, clinic: { type: 'string' }, when: { type: 'string' }, reason: { type: 'string' } },
      required: ['provider', 'when'],
    },
    scopes: ['write'],
    authz: {},
  },
  {
    name: 'release_records',
    description: 'Release medical records to a third party (requires step-up + consent).',
    inputSchema: { type: 'object', properties: { recordId: { type: 'string' } }, required: ['recordId'] },
    scopes: ['write'],
    authz: { stepUp: true, consent: true },
  },
];

jest.mock('../../services/configStore', () => ({
  getEffective: jest.fn((key) => {
    const defaults = { ff_hitl_enabled: 'true' };
    return defaults[key] || null;
  }),
}));

jest.mock('../../services/verticalDispatch', () => ({
  hasPlugin: jest.fn(() => true),
  toolSchemasFor: jest.fn(),
  executeToolFor: jest.fn(async () => ({ result: { plan: 'PPO' }, render: 'view_coverage' })),
  resolvePlugin: jest.fn(() => ({
    getTools: () => [
      { name: 'view_coverage', inputSchema: { type: 'object', properties: {} }, authz: {} },
      ...HEALTHCARE_WRITE_TOOLS,
    ],
  })),
  authzFor: jest.fn(() => ({ release_records: { stepUp: true, consent: true }, book_appointment: {} })),
}));

const dispatch = require('../../services/verticalDispatch');
const { __test } = require('../../services/demoAgentLangGraphService');

describe('dispatchVerticalIntent', () => {
  beforeEach(() => jest.clearAllMocks());

  it('executes the vertical tool and returns an envelope with a verticalResult payload', async () => {
    const heuristic = { kind: 'vertical', vertical: 'healthcare', action: 'view_coverage', params: {} };
    const out = await __test.dispatchVerticalIntent(heuristic, { userId: 'u', userToken: 't', req: null, tokenEvents: [], sessionId: 's' });
    expect(dispatch.executeToolFor).toHaveBeenCalledWith('healthcare', 'view_coverage', {}, expect.any(Object), expect.any(Function));
    expect(typeof out.reply).toBe('string');
    expect(out.success).toBe(true);
    expect(out.verticalResult).toEqual({ action: 'view_coverage', render: 'view_coverage', data: { plan: 'PPO' } });
  });

  it('surfaces a tool error in the reply and marks success:false', async () => {
    dispatch.executeToolFor.mockResolvedValueOnce({ result: { error: 'boom' }, render: 'text' });
    const heuristic = { kind: 'vertical', vertical: 'healthcare', action: 'book_appointment', params: { provider: 'Dr. Lee', when: '2026-06-01' } };
    const out = await __test.dispatchVerticalIntent(heuristic, { userId: 'u', userToken: 't', req: null, tokenEvents: [], sessionId: 's' });
    expect(out.success).toBe(false);
    expect(out.reply).toMatch(/boom/);
  });

  it('returns a needsParams envelope when required params are missing (no execute)', async () => {
    const heuristic = { kind: 'vertical', vertical: 'healthcare', action: 'book_appointment', params: {} };
    const out = await __test.dispatchVerticalIntent(heuristic, { userId: 'u', userToken: 't', req: null, tokenEvents: [], sessionId: 's' });
    expect(out.success).toBe(false);
    expect(out.needsParams).toBeDefined();
    expect(out.needsParams.action).toBe('book_appointment');
    expect(out.needsParams.missing).toContain('provider');
    expect(dispatch.executeToolFor).not.toHaveBeenCalled();
  });

  it('executes book_appointment when required params are present', async () => {
    dispatch.executeToolFor.mockResolvedValueOnce({ result: { status: 'Confirmed' }, render: 'book_appointment' });
    const heuristic = { kind: 'vertical', vertical: 'healthcare', action: 'book_appointment', params: { provider: 'Dr. Lee', when: '2026-06-01' } };
    const out = await __test.dispatchVerticalIntent(heuristic, { userId: 'u', userToken: 't', req: null, tokenEvents: [], sessionId: 's' });
    expect(dispatch.executeToolFor).toHaveBeenCalled();
    expect(out.success).toBe(true);
    expect(out.verticalResult).toEqual({ action: 'book_appointment', render: 'book_appointment', data: { status: 'Confirmed' } });
  });

  it('gates release_records with a step_up_required envelope (does not execute)', async () => {
    const heuristic = { kind: 'vertical', vertical: 'healthcare', action: 'release_records', params: { recordId: 'rec-1' } };
    const out = await __test.dispatchVerticalIntent(heuristic, { userId: 'u', userToken: 't', req: null, tokenEvents: [], sessionId: 's' });
    expect(out.error).toBe('step_up_required');
    expect(out.step_up_required).toBe(true);
    expect(out.success).toBe(false);
    expect(dispatch.executeToolFor).not.toHaveBeenCalled();
  });
});
