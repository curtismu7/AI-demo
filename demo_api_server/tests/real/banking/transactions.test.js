'use strict';

const { createBffClient } = require('../helpers/bffClient');

const VERTICAL = 'banking';

describe(`Transactions — ${VERTICAL} vertical (real)`, () => {
  let client;

  beforeAll(() => {
    skipIfNoSession();
    client = createBffClient('enduser');
  });

  describe('GET /api/transactions/my', () => {
    it('returns 200 with array', async () => {
      const r = await client.get('/api/transactions/my');
      expect(r.status).toBe(200);
      expect(Array.isArray(r.data)).toBe(true);
    });

    it('transactions include expected fields', async () => {
      const r = await client.get('/api/transactions/my');
      if (r.data.length === 0) return;
      const tx = r.data[0];
      expect(tx).toMatchObject({
        id:     expect.any(String),
        type:   expect.any(String),
        amount: expect.any(Number),
      });
    });
  });

  describe('GET /api/transactions (admin-only)', () => {
    it('returns 403 for enduser', async () => {
      const r = await client.get('/api/transactions');
      expect(r.status).toBe(403);
    });
  });
});
