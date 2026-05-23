'use strict';

const axios = require('axios');
const { httpsAgent, BFF_BASE } = require('../helpers/constants');

// NL route is unauthenticated-capable — no session required
const client = axios.create({ baseURL: BFF_BASE, httpsAgent, validateStatus: () => true });

describe('Chip NL routing (real)', () => {

  it('routes "My Accounts" chip message to accounts action via heuristic', async () => {
    const r = await client.post('/api/banking-agent/nl', {
      message: 'show my accounts',
      provider: 'heuristic',
    });

    expect(r.status).toBe(200);
    expect(r.data.source).toBe('heuristic');
    expect(r.data.result.kind).toBe('banking');
    expect(r.data.result.banking.action).toBe('accounts');
  });

  it('routes "what did I spend money on recently" to transactions action via Helix', async () => {
    const r = await client.post('/api/banking-agent/nl', {
      message: 'what did I spend money on recently',
      provider: 'auto',
    });

    expect(r.status).toBe(200);
    // Helix (or ollama fallback) must answer — heuristic returns none for this phrase
    expect(['helix', 'helix_fallback', 'ollama']).toContain(r.data.source);
    expect(r.data.result.kind).toBe('banking');
    expect(r.data.result.banking.action).toBe('transactions');
  });
});
