// banking_api_ui/src/utils/__tests__/formatAgentResult.test.js
import { formatAgentResult } from '../formatAgentResult';

test('uses vertical terminology.balance instead of "Balance:" when supplied', () => {
  const terminology = { balance: 'Coverage' };
  const text = formatAgentResult({ balance: 500 }, terminology);
  expect(text).toBe('Coverage: $500.00');
});
