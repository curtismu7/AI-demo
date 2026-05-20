// banking_api_ui/src/utils/__tests__/bankingAgentFloatingDefaultOpen.test.js
import { isBankingAgentFloatingDefaultOpen } from '../bankingAgentFloatingDefaultOpen';

describe('isBankingAgentFloatingDefaultOpen', () => {
  it('defaults closed on dashboard home routes', () => {
    expect(isBankingAgentFloatingDefaultOpen('/')).toBe(false);
    expect(isBankingAgentFloatingDefaultOpen('/admin')).toBe(false);
    expect(isBankingAgentFloatingDefaultOpen('/dashboard')).toBe(false);
    expect(isBankingAgentFloatingDefaultOpen('/admin/')).toBe(false);
  });

  it('defaults open on non-dashboard tool routes', () => {
    expect(isBankingAgentFloatingDefaultOpen('/logs')).toBe(true);
    expect(isBankingAgentFloatingDefaultOpen('/mcp-inspector')).toBe(true);
    expect(isBankingAgentFloatingDefaultOpen('/demo-data')).toBe(true);
  });
});
