/**
 * @file mcpToolAuthorizationService.test.js
 * First MCP tool PingOne Authorize gate (session-scoped).
 */

jest.mock('../../services/configStore');
jest.mock('../../services/pingOneAuthorizeService', () => ({
  evaluateMcpToolDelegation: jest.fn(),
  isMcpDelegationDecisionReady: jest.fn(),
}));
jest.mock('../../services/simulatedAuthorizeService', () => ({
  evaluateMcpFirstTool: jest.fn(),
  isSimulatedModeEnabled: jest.fn(),
}));

const configStore = require('../../services/configStore');
const pingOneAuthorizeService = require('../../services/pingOneAuthorizeService');
const simulatedAuthorizeService = require('../../services/simulatedAuthorizeService');
const {
  evaluateMcpFirstToolGate,
  getMcpFirstToolGateStatus,
  nestedActIdFromClaim,
} = require('../../services/mcpToolAuthorizationService');

function jwtWithPayload(payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `eyJhbGciOiJub25lIn0.${body}.x`;
}

describe('mcpToolAuthorizationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    configStore.get.mockImplementation(() => null);
    configStore.getEffective = (k) => configStore.get(k);
    simulatedAuthorizeService.isSimulatedModeEnabled.mockReturnValue(false);
    pingOneAuthorizeService.isMcpDelegationDecisionReady.mockReturnValue(false);
  });

  describe('nestedActIdFromClaim', () => {
    it('returns nested client_id when act.act is present', () => {
      expect(
        nestedActIdFromClaim({ client_id: 'mcp', act: { client_id: 'agent' } }),
      ).toBe('agent');
    });
    it('returns empty when no nested act', () => {
      expect(nestedActIdFromClaim({ client_id: 'bff' })).toBe('');
    });
  });

  describe('evaluateMcpFirstToolGate', () => {
    it('returns ran:false when ff_authorize_mcp_first_tool is off', async () => {
      configStore.get.mockReturnValue(null);
      const r = await evaluateMcpFirstToolGate({
        req: { session: {} },
        tool: 'get_my_accounts',
        agentToken: jwtWithPayload({ sub: 'u1', aud: 'mcp' }),
        userSub: 'u1',
      });
      expect(r).toEqual({ ran: false });
    });

    it('returns ran:false when no agent token', async () => {
      configStore.get.mockImplementation((k) =>
        k === 'ff_authorize_mcp_first_tool' ? 'true' : null,
      );
      const r = await evaluateMcpFirstToolGate({
        req: { session: {} },
        tool: 'get_my_accounts',
        agentToken: null,
        userSub: 'u1',
      });
      expect(r).toEqual({ ran: false });
    });

    it('skips when session already has mcpFirstToolAuthorizeDone', async () => {
      configStore.get.mockImplementation((k) =>
        k === 'ff_authorize_mcp_first_tool' ? 'true' : null,
      );
      const r = await evaluateMcpFirstToolGate({
        req: { session: { mcpFirstToolAuthorizeDone: true } },
        tool: 'get_my_accounts',
        agentToken: jwtWithPayload({ sub: 'u1' }),
        userSub: 'u1',
      });
      expect(r).toEqual({ ran: false });
    });

    it('skips for admin role', async () => {
      configStore.get.mockImplementation((k) =>
        k === 'ff_authorize_mcp_first_tool' ? 'true' : null,
      );
      const r = await evaluateMcpFirstToolGate({
        req: { session: { user: { role: 'admin' } } },
        tool: 'get_my_accounts',
        agentToken: jwtWithPayload({ sub: 'u1' }),
        userSub: 'u1',
      });
      expect(r).toEqual({ ran: false });
    });

    it('runs simulated path and permits', async () => {
      configStore.get.mockImplementation((k) => {
        if (k === 'ff_authorize_mcp_first_tool') return 'true';
        if (k === 'PINGONE_RESOURCE_MCP_SERVER_URI') return 'https://mcp.example';
        return null;
      });
      simulatedAuthorizeService.isSimulatedModeEnabled.mockReturnValue(true);
      simulatedAuthorizeService.evaluateMcpFirstTool.mockResolvedValue({
        decision: 'PERMIT',
        stepUpRequired: false,
        path: 'simulated',
        decisionId: 'sim-1',
        raw: {},
      });

      const r = await evaluateMcpFirstToolGate({
        req: { session: { user: { role: 'user' } } },
        tool: 'get_my_accounts',
        agentToken: jwtWithPayload({
          sub: 'user-sub',
          aud: 'https://mcp.example',
          act: { client_id: 'bff-client' },
        }),
        userSub: 'user-sub',
        userAcr: 'Single_Factor',
      });

      expect(r.ran).toBe(true);
      expect(r.permit).toBe(true);
      expect(simulatedAuthorizeService.evaluateMcpFirstTool).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-sub',
          toolName: 'get_my_accounts',
          actClientId: 'bff-client',
          mcpResourceUri: 'https://mcp.example',
        }),
      );
    });

    it('returns 403 block when simulated denies', async () => {
      configStore.get.mockImplementation((k) =>
        k === 'ff_authorize_mcp_first_tool' ? 'true' : null,
      );
      simulatedAuthorizeService.isSimulatedModeEnabled.mockReturnValue(true);
      simulatedAuthorizeService.evaluateMcpFirstTool.mockResolvedValue({
        decision: 'DENY',
        stepUpRequired: false,
        path: 'simulated',
        decisionId: 'sim-d',
        raw: {},
      });

      const r = await evaluateMcpFirstToolGate({
        req: { session: { user: { role: 'user' } } },
        tool: 'create_transfer',
        agentToken: jwtWithPayload({ sub: 'u1' }),
        userSub: 'u1',
      });

      expect(r.ran).toBe(true);
      expect(r.block.status).toBe(403);
      expect(r.block.body.error).toBe('mcp_authorization_denied');
    });

    it('calls PingOne when live and MCP endpoint ready', async () => {
      configStore.get.mockImplementation((k) => {
        if (k === 'ff_authorize_mcp_first_tool') return 'true';
        if (k === 'ff_authorize_fail_open') return 'false';
        if (k === 'authorize_mcp_decision_endpoint_id') return 'mcp-endpoint-uuid';
        if (k === 'PINGONE_RESOURCE_MCP_SERVER_URI') return 'https://mcp';
        return null;
      });
      simulatedAuthorizeService.isSimulatedModeEnabled.mockReturnValue(false);
      pingOneAuthorizeService.isMcpDelegationDecisionReady.mockReturnValue(true);
      pingOneAuthorizeService.evaluateMcpToolDelegation.mockResolvedValue({
        decision: 'PERMIT',
        stepUpRequired: false,
        path: 'decision-endpoint',
        decisionId: 'p1-1',
        raw: {},
      });

      const r = await evaluateMcpFirstToolGate({
        req: { session: { user: { role: 'user' } } },
        tool: 'get_my_accounts',
        agentToken: jwtWithPayload({ sub: 'sub-99', aud: 'https://mcp' }),
        userSub: 'sub-99',
      });

      expect(r.ran).toBe(true);
      expect(r.permit).toBe(true);
      expect(pingOneAuthorizeService.evaluateMcpToolDelegation).toHaveBeenCalled();
    });
  });

  describe('getMcpFirstToolGateStatus', () => {
    it('reports enabled flag and live readiness', () => {
      configStore.get.mockImplementation((k) => {
        if (k === 'ff_authorize_mcp_first_tool') return 'true';
        if (k === 'authorize_mcp_decision_endpoint_id') return 'ep-1';
        return null;
      });
      simulatedAuthorizeService.isSimulatedModeEnabled.mockReturnValue(false);
      pingOneAuthorizeService.isMcpDelegationDecisionReady.mockReturnValue(true);

      const s = getMcpFirstToolGateStatus();
      expect(s.mcpFirstToolGateEnabled).toBe(true);
      expect(s.mcpFirstToolWouldRunLive).toBe(true);
      expect(s.mcpFirstToolWouldRunSimulated).toBe(false);
    });
  });
});
