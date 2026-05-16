'use strict';

/**
 * Unit tests for credentialSwap module — 3-disposition decision matrix.
 * Tests 1-7 per plan spec + Tests 8-10 for H4 guard clause assertions.
 */

import { selectCredentialForBackend, IdTokenMissingError } from '../src/credentialSwap';
import { routeTool, backendHttpUrl, backendWsUrl, backendResourceUri } from '../src/router';
import type { GatewayConfig } from '../src/config';

// Mock exchangeTokenForBackend to avoid real HTTP calls
jest.mock('../src/tokenExchange', () => ({
  exchangeTokenForBackend: jest.fn(),
}));
import { exchangeTokenForBackend } from '../src/tokenExchange';
const mockExchange = exchangeTokenForBackend as jest.MockedFunction<typeof exchangeTokenForBackend>;

const BASE_CONFIG: GatewayConfig = {
  port: 3005,
  host: '0.0.0.0',
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  tokenEndpointAuthMethod: 'basic',
  tokenEndpoint: 'https://auth.example.com/token',
  gatewayResourceUri: 'https://gateway.example.com',
  mcpOlbWsUrl: 'ws://localhost:8080',
  mcpInvestWsUrl: 'ws://localhost:8081',
  mcpOlbResourceUri: 'https://mcp-olb.example.com',
  mcpInvestResourceUri: 'https://mcp-invest.example.com',
  pingAuthorizeEndpoint: '',
  pingAuthorizeWorkerId: '',
  hitlServiceUrl: '',
  introspectionEndpoint: '',
  devBypass: false,
  demoApiKeyServiceKey: 'demo-api-key-1234',
  mortgageServiceBaseUrl: 'http://localhost:8082',
  mortgageServiceApiKey: 'demo-mortgage-key-0000',
  bffInternalIdTokenUrl: 'http://localhost:3001/internal/id-token',
  bffInternalSecret: 'dev-shared-secret-change-me',
  bankingResourceServerBaseUrl: 'http://localhost:3001',
  bankingResourceServerResourceUri: 'https://banking-resource-server.bxf.com',
};

const SUBJECT_TOKEN = 'inbound-user-bearer-token';
const ID_TOKEN = 'eyJhbGciOiJSUzI1NiJ9.fake.id.token';

beforeEach(() => {
  mockExchange.mockReset();
});

// ---------------------------------------------------------------------------
// Test 1: api_key disposition — Gateway-only marker
// ---------------------------------------------------------------------------
test('Test 1: apikey target returns api_key disposition with masked last4, never calls exchange', async () => {
  const result = await selectCredentialForBackend('apikey', SUBJECT_TOKEN, ID_TOKEN, BASE_CONFIG);

  expect(result.kind).toBe('api_key');
  expect(result.credentialPath).toBe('api_key');
  expect(result.apiKeyMaskedLast4).toBe('1234'); // last 4 of 'demo-api-key-1234'
  expect(mockExchange).not.toHaveBeenCalled();
});

// ---------------------------------------------------------------------------
// Test 2: dual_token disposition — RFC 8693 exchange with correct aud
// ---------------------------------------------------------------------------
test('Test 2 (SPEC-CRITICAL): dual_token exchanges with bankingResourceServerResourceUri, passes idToken unchanged', async () => {
  mockExchange.mockResolvedValue('exchanged-for-bankingrs-aud');

  const result = await selectCredentialForBackend('dualtoken', SUBJECT_TOKEN, 'fake.id.token', BASE_CONFIG);

  expect(result.kind).toBe('dual_token');
  expect(result.credentialPath).toBe('dual_token');
  expect(result.authorization).toBe('Bearer exchanged-for-bankingrs-aud');
  expect(result.idToken).toBe('fake.id.token');

  // Assert exchange was called with the CORRECT audience (bankingResourceServerResourceUri)
  expect(mockExchange).toHaveBeenCalledWith(
    SUBJECT_TOKEN,
    BASE_CONFIG.bankingResourceServerResourceUri,
    BASE_CONFIG,
  );
  expect(mockExchange).toHaveBeenCalledTimes(1);
});

// ---------------------------------------------------------------------------
// Test 3: dual_token with null idToken throws id_token_missing
// ---------------------------------------------------------------------------
test('Test 3: dual_token with null idToken throws IdTokenMissingError with code id_token_missing', async () => {
  await expect(
    selectCredentialForBackend('dualtoken', SUBJECT_TOKEN, null, BASE_CONFIG),
  ).rejects.toThrow(IdTokenMissingError);

  await expect(
    selectCredentialForBackend('dualtoken', SUBJECT_TOKEN, null, BASE_CONFIG),
  ).rejects.toMatchObject({ code: 'id_token_missing' });

  expect(mockExchange).not.toHaveBeenCalled();
});

// ---------------------------------------------------------------------------
// Test 4: oauth_bearer disposition (bankingdata target)
// ---------------------------------------------------------------------------
test('Test 4: bankingdata target returns oauth_bearer disposition with exchanged token', async () => {
  mockExchange.mockResolvedValue('exchanged-banking-token');

  const result = await selectCredentialForBackend('bankingdata', SUBJECT_TOKEN, ID_TOKEN, BASE_CONFIG);

  expect(result.kind).toBe('oauth_bearer');
  expect(result.credentialPath).toBe('oauth_bearer');
  expect(result.authorization).toBe('Bearer exchanged-banking-token');

  expect(mockExchange).toHaveBeenCalledWith(
    SUBJECT_TOKEN,
    BASE_CONFIG.bankingResourceServerResourceUri,
    BASE_CONFIG,
  );
});

// ---------------------------------------------------------------------------
// Test 5: routeTool returns correct targets
// ---------------------------------------------------------------------------
test('Test 5: routeTool returns correct targets for each tool name', () => {
  expect(routeTool('show_mortgage')).toBe('apikey');
  expect(routeTool('user_profile_card')).toBe('dualtoken');
  expect(routeTool('demo_show_accounts')).toBe('bankingdata');
  expect(routeTool('get_my_accounts')).toBe('olb');
});

// ---------------------------------------------------------------------------
// Test 6: backendHttpUrl returns correct URLs
// ---------------------------------------------------------------------------
test('Test 6: backendHttpUrl returns correct URLs for each target/tool', () => {
  expect(backendHttpUrl('bankingdata', 'demo_show_accounts', BASE_CONFIG))
    .toBe('http://localhost:3001/api/resource-server/accounts');
  expect(backendHttpUrl('bankingdata', 'demo_show_transactions', BASE_CONFIG))
    .toBe('http://localhost:3001/api/resource-server/transactions');
  expect(backendHttpUrl('dualtoken', 'user_profile_card', BASE_CONFIG))
    .toBe('http://localhost:3001/api/resource-server/identity');
  expect(backendHttpUrl('olb', 'get_my_accounts', BASE_CONFIG)).toBe('');
  expect(backendHttpUrl('invest', 'get_investment_balance', BASE_CONFIG)).toBe('');
  // Phase 267: show_mortgage is the first apikey tool with a real backend.
  expect(backendHttpUrl('apikey', 'show_mortgage', BASE_CONFIG))
    .toBe('http://localhost:8082/mortgage');
  // Any other apikey tool stays Gateway-only (empty → static marker).
  expect(backendHttpUrl('apikey', 'some_other_marker_tool', BASE_CONFIG)).toBe('');
});

// ---------------------------------------------------------------------------
// Test 7 (W1 regression guard): existing OLB tools still route to 'olb'
// ---------------------------------------------------------------------------
test('Test 7: existing OLB tools still route to olb (W1 regression guard)', () => {
  const olbTools = [
    'get_my_accounts',
    'get_account_balance',
    'get_sensitive_account_details',
    'get_my_transactions',
    'create_deposit',
    'create_withdrawal',
    'create_transfer',
  ];
  for (const tool of olbTools) {
    expect(routeTool(tool)).toBe('olb');
  }
});

// ---------------------------------------------------------------------------
// Tests 8-10 (H4 guard clauses): backendWsUrl and backendResourceUri with new targets
// ---------------------------------------------------------------------------
test('Test 8: backendWsUrl returns empty string for new Phase 266 targets', () => {
  expect(backendWsUrl('apikey', BASE_CONFIG)).toBe('');
  expect(backendWsUrl('dualtoken', BASE_CONFIG)).toBe('');
  expect(backendWsUrl('bankingdata', BASE_CONFIG)).toBe('');
  // Existing targets still work
  expect(backendWsUrl('olb', BASE_CONFIG)).toBe('ws://localhost:8080');
  expect(backendWsUrl('invest', BASE_CONFIG)).toBe('ws://localhost:8081');
});

test('Test 9: backendResourceUri returns empty string for new Phase 266 targets', () => {
  expect(backendResourceUri('apikey', BASE_CONFIG)).toBe('');
  expect(backendResourceUri('dualtoken', BASE_CONFIG)).toBe('');
  expect(backendResourceUri('bankingdata', BASE_CONFIG)).toBe('');
  // Existing targets still work
  expect(backendResourceUri('olb', BASE_CONFIG)).toBe('https://mcp-olb.example.com');
  expect(backendResourceUri('invest', BASE_CONFIG)).toBe('https://mcp-invest.example.com');
});

test('Test 10: McpTokenExchangeClient uses backendResourceUri which returns empty for new targets (proves no audience leak)', () => {
  // Verifying that routeTool + backendResourceUri for the new Phase 266 tools
  // return empty string audience — this would be caught before McpTokenExchangeClient
  // is called in the new dispatch path.
  const target = routeTool('show_mortgage');
  expect(backendResourceUri(target, BASE_CONFIG)).toBe('');

  const dualTarget = routeTool('user_profile_card');
  expect(backendResourceUri(dualTarget, BASE_CONFIG)).toBe('');

  const bdTarget = routeTool('demo_show_accounts');
  expect(backendResourceUri(bdTarget, BASE_CONFIG)).toBe('');
});
