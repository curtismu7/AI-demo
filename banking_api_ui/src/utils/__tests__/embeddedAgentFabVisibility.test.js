// banking_api_ui/src/utils/__tests__/embeddedAgentFabVisibility.test.js
import { shouldShowGlobalFloatingBankingAgentFab } from '../embeddedAgentFabVisibility';

const customer = { role: 'customer', id: '1' };
const admin = { role: 'admin', id: '2' };

describe('shouldShowGlobalFloatingBankingAgentFab', () => {
  it('shows FAB when not logged in (marketing / login)', () => {
    expect(
      shouldShowGlobalFloatingBankingAgentFab({
        user: null,
        agentUiMode: 'embedded',
      }),
    ).toBe(false);
  });

  it('shows FAB when mode is floating', () => {
    expect(
      shouldShowGlobalFloatingBankingAgentFab({
        user: customer,
        agentUiMode: 'floating',
      }),
    ).toBe(true);
  });

  it('hides FAB when mode is embedded', () => {
    expect(
      shouldShowGlobalFloatingBankingAgentFab({
        user: customer,
        agentUiMode: 'embedded',
      }),
    ).toBe(false);
    expect(shouldShowGlobalFloatingBankingAgentFab({ user: null, agentUiMode: 'embedded' })).toBe(false);
  });
});
