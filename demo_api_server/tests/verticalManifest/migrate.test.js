const path = require('path');
const fs = require('fs');
const os = require('os');
const { migrate, transformOne } = require('../../scripts/migrateVerticalsV3');

function writeOld(root, id, content) {
  fs.writeFileSync(path.join(root, `${id}.json`), JSON.stringify(content));
}

const HEALTHCARE_V2 = {
  id: 'healthcare', schemaVersion: 2,
  identity: { displayName: 'CareConnect', tagline: 'Health' },
  theme: { cssVars: { '--theme-accent': '#0f766e' } },
  agent: { persona: 'Care Assistant' },
  dashboard: {
    kind: 'healthcare',
    chips: [{ key: 'balance', label: 'Check Coverage' }],
    hero: { cards: [{ label: 'Next Appt', dataKey: 'heroStats.nextAppt', format: 'date' }] },
    llmChipGroups: {},
    mockData: { heroStats: { nextAppt: '2026-06-03' }, patientRecords: [{ id: 'pr1' }] },
  },
  featurePage: {
    mcpTool: 'show_health_record', pageTitle: 'Health Record',
    accentColor: '#0f766e',
    accentBg: 'rgba(0,0,0,0.06)', accentLight: '#f0fdfa', accentCode: '#ccfbf1',
    accentText: '#134e4a', accentAccentText: '#0f766e',
    dataKey: 'healthRecord',
    fields: [{ label: 'Record ID', path: 'recordId' }],
  },
};

const BANKING_V2_WITH_PCT = {
  id: 'banking', schemaVersion: 2,
  identity: { displayName: 'Bank' },
  theme: { cssVars: { '--theme-accent': '#000' } },
  agent: { persona: 'B' },
  dashboard: {
    kind: 'banking',
    chips: [],
    hero: { cards: [] },
    llmChipGroups: {},
  },
  featurePage: {
    mcpTool: 't', pageTitle: 'P', dataKey: 'd',
    fields: [{ label: 'Interest rate', path: 'interestRate', format: 'pct' }],
  },
};

const SPORTING_V2_WITH_TIER = {
  id: 'sporting-goods', schemaVersion: 2,
  identity: { displayName: 'Great Buy' },
  theme: { cssVars: { '--theme-accent': '#000' } },
  agent: { persona: 'Gear coach' },
  dashboard: {
    kind: 'sporting-goods',
    chips: [],
    hero: { cards: [{ label: 'Loyalty Tier', dataKey: 'heroStats.loyaltyTier', format: 'tier' }] },
    llmChipGroups: {},
  },
};

const ADMIN_V2 = {
  id: 'admin', schemaVersion: 2,
  identity: { displayName: 'Admin' },
  theme: { cssVars: { '--theme-accent': '#111' } },
  agent: { persona: 'Admin Agent' },
};

describe('transformOne', () => {
  test('schemaVersion bump and id rename for admin', () => {
    const t = transformOne(ADMIN_V2);
    expect(t.newId).toBe('admin-console');
    expect(t.manifest.id).toBe('admin-console');
    expect(t.manifest.schemaVersion).toBe(3);
  });

  test('non-admin id is unchanged', () => {
    const t = transformOne(HEALTHCARE_V2);
    expect(t.newId).toBe('healthcare');
  });

  test('mock data split out', () => {
    const t = transformOne(HEALTHCARE_V2);
    expect(t.manifest.dashboard.mockData).toBeUndefined();
    expect(t.mockData.heroStats.nextAppt).toBe('2026-06-03');
    expect(t.mockData.patientRecords).toHaveLength(1);
  });

  test('accent variants dropped, accentColor preserved', () => {
    const t = transformOne(HEALTHCARE_V2);
    expect(t.manifest.featurePage.accentColor).toBe('#0f766e');
    expect(t.manifest.featurePage.accentBg).toBeUndefined();
    expect(t.manifest.featurePage.accentLight).toBeUndefined();
    expect(t.manifest.featurePage.accentCode).toBeUndefined();
    expect(t.manifest.featurePage.accentText).toBeUndefined();
    expect(t.manifest.featurePage.accentAccentText).toBeUndefined();
  });

  test("format 'pct' normalized to 'percent' in featurePage fields", () => {
    const t = transformOne(BANKING_V2_WITH_PCT);
    expect(t.manifest.featurePage.fields[0].format).toBe('percent');
  });

  test("format 'tier' normalized to 'text' in hero cards", () => {
    const t = transformOne(SPORTING_V2_WITH_TIER);
    expect(t.manifest.dashboard.hero.cards[0].format).toBe('text');
  });
});

describe('migrate (full sweep)', () => {
  let root;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-')); });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  test('happy path: writes new folders, deletes old files', () => {
    writeOld(root, 'healthcare', HEALTHCARE_V2);
    writeOld(root, 'banking', BANKING_V2_WITH_PCT);
    writeOld(root, 'admin', ADMIN_V2);

    migrate(root);

    expect(fs.existsSync(path.join(root, 'healthcare', 'manifest.json'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'healthcare', 'mock-data.json'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'healthcare.json'))).toBe(false);

    // admin → admin-console
    expect(fs.existsSync(path.join(root, 'admin-console', 'manifest.json'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'admin.json'))).toBe(false);

    // mock data isolated
    const hcMan = JSON.parse(fs.readFileSync(path.join(root, 'healthcare', 'manifest.json'), 'utf8'));
    expect(hcMan.dashboard.mockData).toBeUndefined();
    const hcMock = JSON.parse(fs.readFileSync(path.join(root, 'healthcare', 'mock-data.json'), 'utf8'));
    expect(hcMock.heroStats.nextAppt).toBe('2026-06-03');

    expect(hcMan.schemaVersion).toBe(3);
  });

  test('all-or-nothing: invalid manifest aborts everything', () => {
    writeOld(root, 'banking', BANKING_V2_WITH_PCT);
    writeOld(root, 'bad', { schemaVersion: 2 }); // missing identity, agent, theme

    expect(() => migrate(root)).toThrow();

    expect(fs.existsSync(path.join(root, 'banking.json'))).toBe(true);  // old not deleted
    expect(fs.existsSync(path.join(root, 'banking', 'manifest.json'))).toBe(false); // new not written
  });

  test('idempotent: re-run on already-migrated tree is a no-op', () => {
    writeOld(root, 'banking', BANKING_V2_WITH_PCT);
    migrate(root);
    expect(() => migrate(root)).not.toThrow();
    expect(fs.existsSync(path.join(root, 'banking', 'manifest.json'))).toBe(true);
  });
});
