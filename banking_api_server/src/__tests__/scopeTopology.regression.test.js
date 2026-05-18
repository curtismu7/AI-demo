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

describe('MCP_TOOL_SCOPES derives from manifest', () => {
  const { MCP_TOOL_SCOPES } = require('../../services/mcpWebSocketClient');
  const topo = require('../../services/scopeTopology');

  test('create_transfer now requests banking:transfer', () => {
    expect(MCP_TOOL_SCOPES.create_transfer).toEqual(['banking:write', 'banking:transfer']);
  });

  test('every manifest tool is present in MCP_TOOL_SCOPES with matching scopes', () => {
    for (const name of topo.allTools()) {
      expect(MCP_TOOL_SCOPES[name]).toEqual(topo.toolScopes(name));
    }
  });
});

describe('pingoneProvisionService scope arrays match manifest', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(
    path.join(__dirname, '../../services/pingoneProvisionService.js'),
    'utf8'
  );
  const topo = require('../../services/scopeTopology');

  test('main Super Banking API resource declares banking:transfer scope', () => {
    expect(src).toMatch(/name:\s*'banking:transfer'/);
  });

  test('User App grant array contains every Super Banking User App manifest scope', () => {
    const m = src.match(/userGrantResult\s*=\s*await this\.grantScopesToApplication\([\s\S]*?\[([\s\S]*?)\]/);
    expect(m).not.toBeNull();
    const granted = m[1].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean);
    for (const s of topo.appGrantedScopes('Super Banking User App')) {
      expect(granted).toContain(s);
    }
  });
});

describe('scopePolicyEngine + scopeAuditService derive from manifest', () => {
  const topo = require('../../services/scopeTopology');

  test('scopePolicyEngine SCOPE_TAXONOMY covers every manifest banking scope', () => {
    const engine = require('../../services/scopePolicyEngine');
    const all = engine.getAllScopes();
    const names = new Set(all.map(s => (typeof s === 'string' ? s : s.scope)));
    for (const scope of Object.keys(topo._manifest().scopes)) {
      expect(names.has(scope)).toBe(true);
    }
  });

  test('scopeAuditService SCOPE_REFERENCE_TABLE reflects manifest app grants', () => {
    const { SCOPE_REFERENCE_TABLE } = require('../../services/scopeAuditService');
    expect(SCOPE_REFERENCE_TABLE['Super Banking User App'])
      .toEqual(expect.arrayContaining(['banking:transfer']));
  });

  test('SCOPE_OPS_OVERLAY has no keys absent from the manifest', () => {
    const engine = require('../../services/scopePolicyEngine');
    const manifestScopes = new Set(Object.keys(topo._manifest().scopes));
    for (const s of engine.getAllScopes().map(x => (typeof x === 'string' ? x : x.scope))) {
      expect(manifestScopes.has(s)).toBe(true);
    }
  });
});
