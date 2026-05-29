import { applyThemeTokens, _resetThemeTokens } from '../applyThemeTokens';

describe('applyThemeTokens', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('style');
    _resetThemeTokens();
  });

  test('writes each cssVar to documentElement.style', () => {
    applyThemeTokens({ '--theme-accent': '#000', '--brand-hero-start': '#abc' });
    expect(document.documentElement.style.getPropertyValue('--theme-accent')).toBe('#000');
    expect(document.documentElement.style.getPropertyValue('--brand-hero-start')).toBe('#abc');
  });

  test('clears previously-set keys not present in new vars', () => {
    applyThemeTokens({ '--a': '1', '--b': '2' });
    applyThemeTokens({ '--a': '1' });
    expect(document.documentElement.style.getPropertyValue('--a')).toBe('1');
    expect(document.documentElement.style.getPropertyValue('--b')).toBe('');
  });

  test('ignores empty input gracefully', () => {
    expect(() => applyThemeTokens({})).not.toThrow();
  });

  test('ignores null/undefined input gracefully', () => {
    expect(() => applyThemeTokens(null)).not.toThrow();
    expect(() => applyThemeTokens(undefined)).not.toThrow();
  });

  test('does not clear keys set by other code (only tracks its own writes)', () => {
    document.documentElement.style.setProperty('--external', 'external-value');
    applyThemeTokens({ '--mine': 'x' });
    applyThemeTokens({});
    // --external was set outside applyThemeTokens — should NOT be cleared.
    expect(document.documentElement.style.getPropertyValue('--external')).toBe('external-value');
  });
});
