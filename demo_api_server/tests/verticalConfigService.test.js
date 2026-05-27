'use strict';

const svc = require('../services/verticalConfigService');

describe('verticalConfigService', () => {
  beforeEach(() => {
    svc.reloadVerticals();
  });

  it('listVerticals() does not include admin', () => {
    const list = svc.listVerticals();
    const ids = list.map(v => v.id);
    expect(ids).not.toContain('admin');
  });

  it('listVerticals() includes banking, retail, healthcare, sporting-goods, workforce', () => {
    const list = svc.listVerticals();
    const ids = list.map(v => v.id);
    expect(ids).toContain('banking');
    expect(ids).toContain('retail');
    expect(ids).toContain('healthcare');
    expect(ids).toContain('sporting-goods');
    expect(ids).toContain('workforce');
  });

  it('getVerticalConfig("admin") still returns the admin manifest', () => {
    const cfg = svc.getVerticalConfig('admin');
    expect(cfg).not.toBeNull();
    expect(cfg.id).toBe('admin');
  });
});
