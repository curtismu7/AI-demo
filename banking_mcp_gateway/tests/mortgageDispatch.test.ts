'use strict';

/**
 * Phase 267 — mortgage Path A: routing + Authorize-layer scope decision.
 *
 *   1. Routing — show_mortgage is an apikey tool that resolves to the
 *      banking_mortgage_service URL; other apikey tools stay Gateway-only.
 *   2. Scope decision — banking:mortgage:read is enforced by the Authorize
 *      layer, NOT the tool dispatch. When PingOne Authorize is unconfigured
 *      both transports apply evaluateScopeDecisionLocally(), which must mirror
 *      what a PA policy returns. This test proves the HTTP client
 *      (PingOneAuthorizeClient.evaluate) and the WS guard
 *      (pingAuthorizeGuard.guardToolCall) reach the SAME PERMIT/DENY outcome.
 */

import { routeTool, backendHttpUrl } from '../src/router';
import {
  evaluateScopeDecisionLocally,
  getScopesForGatewayTool,
} from '../src/auth/toolScopes';
import { PingOneAuthorizeClient } from '../src/auth/PingOneAuthorizeClient';
import { guardToolCall } from '../src/pingAuthorizeGuard';
import type { GatewayConfig } from '../src/config';
import type { DecodedGatewayToken } from '../src/tokenValidator';

const CONFIG = {
  mortgageServiceBaseUrl: 'http://localhost:8082',
  mortgageServiceApiKey: 'demo-mortgage-key-0000',
  // PingAuthorize intentionally NOT configured — exercises the local decision.
  pingAuthorizeEndpoint: '',
  pingAuthorizeWorkerId: '',
  gatewayResourceUri: 'https://gateway.example.com',
} as unknown as GatewayConfig;

const tokenWith = (scope: string): DecodedGatewayToken =>
  ({ sub: 'user-1', scope, aud: 'mcp-gw', exp: 9999999999 } as DecodedGatewayToken);

describe('Phase 267 — show_mortgage routing', () => {
  test('show_mortgage routes to the apikey disposition', () => {
    expect(routeTool('show_mortgage')).toBe('apikey');
  });

  test('backendHttpUrl returns the mortgage service URL for show_mortgage', () => {
    expect(backendHttpUrl('apikey', 'show_mortgage', CONFIG)).toBe(
      'http://localhost:8082/mortgage',
    );
  });

  test('other apikey tools stay Gateway-only (empty URL → static marker)', () => {
    expect(backendHttpUrl('apikey', 'user_profile_card', CONFIG)).toBe('');
    expect(backendHttpUrl('apikey', 'anything_else', CONFIG)).toBe('');
  });
});

describe('Phase 267 — local Authorize scope decision', () => {
  test('show_mortgage requires banking:mortgage:read', () => {
    expect(getScopesForGatewayTool('show_mortgage')).toEqual([
      'banking:mortgage:read',
    ]);
  });

  test('missing scope → DENY (insufficient_scope)', () => {
    const d = evaluateScopeDecisionLocally(
      'show_mortgage',
      'openid profile banking:read banking:write',
    );
    expect(d.decision).toBe('DENY');
    if (d.decision === 'DENY') {
      expect(d.missingScopes).toEqual(['banking:mortgage:read']);
      expect(d.reason).toMatch(/insufficient_scope/);
    }
  });

  test('scope present → PERMIT', () => {
    expect(
      evaluateScopeDecisionLocally(
        'show_mortgage',
        'openid banking:read banking:mortgage:read',
      ),
    ).toEqual({ decision: 'PERMIT' });
  });

  test('empty / undefined scope claim → DENY (fails closed)', () => {
    expect(evaluateScopeDecisionLocally('show_mortgage', '').decision).toBe('DENY');
    expect(
      evaluateScopeDecisionLocally('show_mortgage', undefined).decision,
    ).toBe('DENY');
  });

  test('irregular whitespace in the claim is tolerated', () => {
    expect(
      evaluateScopeDecisionLocally(
        'show_mortgage',
        '  banking:read   banking:mortgage:read  ',
      ),
    ).toEqual({ decision: 'PERMIT' });
  });
});

describe('Phase 267 — HTTP and WS transports behave identically (no-PA mode)', () => {
  const httpClient = new PingOneAuthorizeClient(CONFIG);

  test('both DENY when banking:mortgage:read is absent', async () => {
    const decoded = tokenWith('openid banking:read');

    const http = await httpClient.evaluate(decoded, 'tools/call', 'show_mortgage');
    const ws = await guardToolCall('show_mortgage', decoded, CONFIG);

    expect(http.decision).toBe('DENY');
    expect(ws.permitted).toBe(false);
    // Same logical reason on both transports.
    expect(http.reason).toMatch(/insufficient_scope/);
    expect(ws.reason).toMatch(/insufficient_scope/);
  });

  test('both PERMIT when banking:mortgage:read is present', async () => {
    const decoded = tokenWith('openid banking:read banking:mortgage:read');

    const http = await httpClient.evaluate(decoded, 'tools/call', 'show_mortgage');
    const ws = await guardToolCall('show_mortgage', decoded, CONFIG);

    expect(http.decision).toBe('PERMIT');
    expect(ws.permitted).toBe(true);
  });

  test('a banking:read-only tool still PERMITs with a basic bearer (no regression)', async () => {
    const decoded = tokenWith('openid banking:read');

    const http = await httpClient.evaluate(decoded, 'tools/call', 'get_my_accounts');
    const ws = await guardToolCall('get_my_accounts', decoded, CONFIG);

    expect(http.decision).toBe('PERMIT');
    expect(ws.permitted).toBe(true);
  });
});
