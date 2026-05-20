jest.mock('../../services/configStore', () => ({
  getEffective: jest.fn(() => 'banking'),
  setConfig: jest.fn(async () => {}),
}));

const svc = require('../../services/verticalConfigService');

describe('verticalConfigService v2', () => {
  beforeEach(() => svc.reloadVerticals());

  test('getActiveManifest returns banking v2 manifest by default', () => {
    const m = svc.getActiveManifest();
    expect(m.id).toBe('banking');
    expect(m.schemaVersion).toBe(2);
    expect(m.identity.displayName).toBe('Super Banking');
    expect(m.theme.cssVars['--app-primary-red']).toBeDefined();
  });

  test('retail manifest is loaded and valid v2', () => {
    const m = svc.getVerticalConfig('retail');
    expect(m.id).toBe('retail');
    expect(m.schemaVersion).toBe(2);
    // Retail manifest uses 'Great Buy' as the display name
    expect(m.identity.displayName).toBe('Great Buy');
    expect(m.dashboard.kind).toBe('retail');
    expect(m.dashboard.mockData.products.length).toBe(10);
  });

  test('getActiveManifest falls back to banking when active id invalid', () => {
    const configStore = require('../../services/configStore');
    configStore.getEffective.mockReturnValueOnce('does-not-exist');
    const m = svc.getActiveManifest();
    expect(m.id).toBe('banking');
  });

  test('loadVerticals skips a manifest missing required fields', () => {
    const loaded = svc.reloadVerticals();
    Object.values(loaded).forEach((v) => {
      expect(v.id).toBeDefined();
      expect(v.schemaVersion).toBe(2);
      expect(v.identity && v.identity.displayName).toBeTruthy();
      expect(v.theme && v.theme.cssVars).toBeTruthy();
    });
  });
});
