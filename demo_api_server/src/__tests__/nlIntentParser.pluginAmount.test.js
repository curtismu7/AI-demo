jest.mock('../../services/verticalDispatch', () => ({ hasPlugin: jest.fn(() => true), heuristicsFor: jest.fn() }));
const dispatch = require('../../services/verticalDispatch');
const { parseHeuristic } = require('../../services/nlIntentParser');

it('does NOT attach amount for a non-amount heuristic', () => {
  dispatch.heuristicsFor.mockReturnValue([{ re: /records/, action: 'view_records' }]);
  const out = parseHeuristic('show my top 5 records', 'health');
  expect(out.params.amount).toBeUndefined();
});
it('attaches amount only when the heuristic opts in', () => {
  dispatch.heuristicsFor.mockReturnValue([{ re: /pay/, action: 'pay_bill', extractsAmount: true }]);
  const out = parseHeuristic('pay 50 now', 'health');
  expect(out.params.amount).toBe(50);
});
