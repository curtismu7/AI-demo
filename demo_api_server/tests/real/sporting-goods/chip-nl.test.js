'use strict';

const axios = require('axios');
const { httpsAgent, BFF_BASE } = require('../helpers/constants');

// NL route is unauthenticated-capable — no session or vertical switch needed.
// The active_vertical configStore key is server-wide state; NL routing reads it
// internally. These tests pass provider hints directly to isolate heuristic vs Helix.
const client = axios.create({ baseURL: BFF_BASE, httpsAgent, validateStatus: () => true });

const VERTICAL = 'sporting-goods';

describe(`Chip NL routing — ${VERTICAL} vertical (real)`, () => {
  it('routes "show my gear" chip to accounts action via heuristic', async () => {
    const r = await client.post('/api/banking-agent/nl', {
      message: 'show my gear',
      provider: 'heuristic',
    });

    expect(r.status).toBe(200);
    expect(r.data.source).toBe('heuristic');
    expect(r.data.result.kind).toBe('banking');
    expect(r.data.result.banking.action).toBe('accounts');
  });

  it('routes "what did I order from Super Sports lately" to transactions via Helix', async () => {
    const r = await client.post('/api/banking-agent/nl', {
      message: 'what did I order from Super Sports lately',
      provider: 'auto',
    });

    expect(r.status).toBe(200);
    expect(['helix', 'helix_fallback', 'ollama']).toContain(r.data.source);
    expect(r.data.result.kind).toBe('banking');
    expect(r.data.result.banking.action).toBe('transactions');
  });
});
