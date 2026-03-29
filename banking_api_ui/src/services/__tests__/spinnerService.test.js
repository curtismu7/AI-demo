// banking_api_ui/src/services/__tests__/spinnerService.test.js
/**
 * spinnerService uses module-level state; reset modules each test.
 * Timers control debounce (200 ms) and minimum visible time (1500 ms).
 */

describe('spinnerService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetModules();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows after debounce when increment is not cancelled by decrement', () => {
    const { spinner } = require('../spinnerService');
    spinner.increment('GET', '/api/accounts');
    expect(spinner.getState().visible).toBe(false);
    jest.advanceTimersByTime(250);
    expect(spinner.getState().visible).toBe(true);
    expect(spinner.getState().message).toMatch(/./);
  });

  it('does not show when decrement runs before debounce fires', () => {
    const { spinner } = require('../spinnerService');
    spinner.increment('GET', '/api/foo');
    spinner.decrement(true);
    jest.advanceTimersByTime(500);
    expect(spinner.getState().visible).toBe(false);
  });

  it('show then hide clears visible state', () => {
    const { spinner } = require('../spinnerService');
    spinner.show('Manual task');
    expect(spinner.getState().visible).toBe(true);
    spinner.hide();
    jest.runAllTimers();
    expect(spinner.getState().visible).toBe(false);
  });

  it('keeps spinner until the last outstanding increment is decremented', () => {
    const { spinner } = require('../spinnerService');
    spinner.increment('GET', '/api/a');
    jest.advanceTimersByTime(250);
    expect(spinner.getState().visible).toBe(true);
    spinner.increment('GET', '/api/b');
    spinner.decrement(false);
    expect(spinner.getState().visible).toBe(true);
    spinner.decrement(false);
    jest.advanceTimersByTime(2000);
    expect(spinner.getState().visible).toBe(false);
  });

  it('unsubscribe stops listener callbacks', () => {
    const { spinner } = require('../spinnerService');
    const spy = jest.fn();
    const off = spinner.subscribe(spy);
    spinner.show('x');
    expect(spy).toHaveBeenCalled();
    const callsAfterShow = spy.mock.calls.length;
    off();
    spinner.hide();
    jest.runAllTimers();
    spinner.show('y');
    expect(spy.mock.calls.length).toBe(callsAfterShow);
  });
});
