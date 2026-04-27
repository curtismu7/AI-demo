'use strict';
/**
 * PingOne API Integration Tests (Phase 239)
 *
 * Validates that BFF PingOne API calls match documented request/response shapes.
 * Requires live PingOne credentials — tests skip gracefully without them.
 *
 * Run: npm test (in banking_api_server/)
 *
 * PingOne API docs: https://apidocs.pingidentity.com/pingone/platform/v1/api/
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const axios = require('axios');

const ENV_ID        = process.env.PINGONE_ENVIRONMENT_ID;
const REGION        = process.env.PINGONE_REGION || 'com';
const AUTH_URL      = process.env.PINGONE_AUTH_URL
  || (ENV_ID ? `https://auth.pingone.${REGION}/${ENV_ID}` : null);
const CLIENT_ID     = process.env.PINGONE_WORKER_TOKEN_CLIENT_ID || process.env.PINGONE_CLIENT_ID;
const CLIENT_SECRET = process.env.PINGONE_WORKER_TOKEN_CLIENT_SECRET || process.env.PINGONE_CLIENT_SECRET;

const HAVE_CREDENTIALS = !!(ENV_ID && AUTH_URL && CLIENT_ID && CLIENT_SECRET);
const it_ = HAVE_CREDENTIALS ? it : it.skip;

async function getWorkerToken() {
  const res = await axios.post(
    `${AUTH_URL}/as/token`,
    new URLSearchParams({ grant_type: 'client_credentials', scope: 'p1:read:user p1:read:env' }),
    { auth: { username: CLIENT_ID, password: CLIENT_SECRET }, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  );
  return res.data.access_token;
}

// ---------------------------------------------------------------------------
// POST /as/token — client_credentials
// ---------------------------------------------------------------------------
describe('POST /as/token — client_credentials', () => {
  it_('returns access_token with documented fields', async () => {
    const res = await axios.post(
      `${AUTH_URL}/as/token`,
      new URLSearchParams({ grant_type: 'client_credentials', scope: 'p1:read:user' }),
      { auth: { username: CLIENT_ID, password: CLIENT_SECRET }, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({
      access_token: expect.any(String),
      token_type: 'Bearer',
      expires_in: expect.any(Number),
    });
  });

  it_('returns documented error shape on bad credentials', async () => {
    try {
      await axios.post(
        `${AUTH_URL}/as/token`,
        new URLSearchParams({ grant_type: 'client_credentials', scope: 'p1:read:user' }),
        { auth: { username: CLIENT_ID, password: 'bad-secret' }, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );
      throw new Error('Should have thrown');
    } catch (err) {
      expect(err.response.status).toBe(401);
      expect(err.response.data).toMatchObject({
        error: expect.any(String),
        error_description: expect.any(String),
      });
    }
  });
});

// ---------------------------------------------------------------------------
// POST /as/introspect — RFC 7662
// ---------------------------------------------------------------------------
describe('POST /as/introspect — RFC 7662', () => {
  it_('returns active:false for invalid token', async () => {
    const res = await axios.post(
      `${AUTH_URL}/as/introspect`,
      new URLSearchParams({ token: 'not-a-real-token' }),
      { auth: { username: CLIENT_ID, password: CLIENT_SECRET }, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ active: false });
  });

  it_('returns RFC 7662 active:true for valid token with claims', async () => {
    const token = await getWorkerToken();
    const res = await axios.post(
      `${AUTH_URL}/as/introspect`,
      new URLSearchParams({ token }),
      { auth: { username: CLIENT_ID, password: CLIENT_SECRET }, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({
      active: true,
      iss: expect.any(String),
      exp: expect.any(Number),
      iat: expect.any(Number),
    });
    // client_credentials tokens use client_id as identity; sub is optional
    expect(res.data.sub || res.data.client_id).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// simulatedAuthorizeService — parity with PingOne Authorize shape (always runs)
// ---------------------------------------------------------------------------
describe('Simulated Authorize response shape (no credentials needed)', () => {
  // NODE_ENV guard in simulatedAuthorizeService blocks production loads.
  const orig = process.env.NODE_ENV;
  beforeAll(() => { process.env.NODE_ENV = 'test'; });
  afterAll(() => { process.env.NODE_ENV = orig; });

  const svc = require('../services/simulatedAuthorizeService');

  it('PERMIT response matches PingOne Authorize shape', async () => {
    const result = await svc.evaluate({
      parameters: { transactionAmount: 100, userId: 'test-user', transactionType: 'transfer' },
    });
    expect(result).toMatchObject({
      id: expect.any(String),
      createdAt: expect.any(String),
      completedAt: expect.any(String),
      duration: expect.any(Number),
      status: 'SUCCESS',
      result: { decision: expect.stringMatching(/^(PERMIT|DENY)$/), weight: 1.0 },
      statements: expect.any(Array),
      obligations: expect.any(Array),
    });
  });

  it('DENY response has same envelope shape as PERMIT', async () => {
    const result = await svc.evaluate({
      parameters: { transactionAmount: 100000, userId: 'test-user', transactionType: 'transfer' },
    });
    expect(result.result.decision).toBe('DENY');
    expect(result.status).toBe('SUCCESS');
    expect(result.id).toBeTruthy();
    expect(result.obligations).toEqual([]);
  });

  it('step-up response includes IDENTITY_REQUIREMENT obligation', async () => {
    const result = await svc.evaluate({
      parameters: { transactionAmount: 20000, userId: 'test-user', transactionType: 'transfer' },
    });
    expect(result.status).toBe('SUCCESS');
    expect(result.obligations.length).toBeGreaterThan(0);
    expect(result.obligations[0]).toMatchObject({ type: 'IDENTITY_REQUIREMENT' });
  });
});
