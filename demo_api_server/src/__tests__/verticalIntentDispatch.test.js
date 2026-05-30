jest.mock('../../services/verticalDispatch', () => ({
  hasPlugin: jest.fn(() => true),
  toolSchemasFor: jest.fn(),
  executeToolFor: jest.fn(async () => ({ result: { plan: 'PPO' }, render: 'view_coverage' })),
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
    const heuristic = { kind: 'vertical', vertical: 'healthcare', action: 'book_appointment', params: {} };
    const out = await __test.dispatchVerticalIntent(heuristic, { userId: 'u', userToken: 't', req: null, tokenEvents: [], sessionId: 's' });
    expect(out.success).toBe(false);
    expect(out.reply).toMatch(/boom/);
  });
});
