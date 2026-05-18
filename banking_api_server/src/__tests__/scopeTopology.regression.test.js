'use strict';

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');

const ROOT = path.resolve(__dirname, '../../../');
const manifestPath = path.join(ROOT, 'scope-topology.json');
const schemaPath = path.join(ROOT, 'scope-topology.schema.json');

describe('scope-topology manifest', () => {
  test('manifest and schema files exist', () => {
    expect(fs.existsSync(manifestPath)).toBe(true);
    expect(fs.existsSync(schemaPath)).toBe(true);
  });

  test('manifest validates against schema', () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(schema);
    const ok = validate(manifest);
    if (!ok) {
      throw new Error('Manifest schema errors: ' + JSON.stringify(validate.errors, null, 2));
    }
    expect(ok).toBe(true);
  });

  test('every scope referenced by a tool/app/resource is declared in scopes', () => {
    const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const declared = new Set(Object.keys(m.scopes));
    const refs = new Set();
    Object.values(m.tools).forEach(t => (t.requiredScopes || []).forEach(s => refs.add(s)));
    Object.values(m.apps).forEach(a => (a.grantedScopes || []).forEach(s => refs.add(s)));
    Object.values(m.resources).forEach(r => (r.scopes || []).forEach(s => refs.add(s)));
    const OIDC = new Set(['openid', 'profile', 'email', 'offline_access']);
    const missing = [...refs].filter(s => !declared.has(s) && !OIDC.has(s) && (s.startsWith('banking:') || s === 'ai_agent'));
    expect(missing).toEqual([]);
  });
});

describe('BFF scopeTopology loader', () => {
  const topo = require('../../services/scopeTopology');

  test('toolScopes(name) returns requiredScopes from manifest', () => {
    expect(topo.toolScopes('create_transfer')).toEqual(['banking:write', 'banking:transfer']);
    expect(topo.toolScopes('get_my_accounts')).toEqual(['banking:read']);
  });

  test('toolScopes(unknown) falls back to [banking:read]', () => {
    expect(topo.toolScopes('no_such_tool')).toEqual(['banking:read']);
  });

  test('appGrantedScopes returns manifest grants', () => {
    expect(topo.appGrantedScopes('Super Banking User App')).toContain('banking:transfer');
  });

  test('resourceScopes returns manifest resource scope list', () => {
    expect(topo.resourceScopes('Super Banking API')).toContain('banking:transfer');
  });
});
