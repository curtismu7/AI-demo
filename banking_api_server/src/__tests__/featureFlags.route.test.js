describe('Feature Flags Route', () => {
  const server = require('../../../server');
  const axios = require('axios');
  const BASE_URL = `http://localhost:${process.env.PORT || 3001}`;

  beforeAll(async () => {
    await new Promise((resolve) => server.listen(3001, resolve));
  });

  afterAll(() => {
    server.close();
  });

  describe('GET /api/admin/feature-flags', () => {
    it('returns all flags with current values', async () => {
      const res = await axios.get(`${BASE_URL}/api/admin/feature-flags`);
      expect(res.status).toBe(200);
      expect(res.data.flags).toBeDefined();
      expect(Array.isArray(res.data.flags)).toBe(true);
      expect(res.data.flags.length).toBeGreaterThan(0);

      // Check for expected flags
      const flagIds = res.data.flags.map(f => f.id);
      expect(flagIds).toContain('ff_inject_may_act');
      expect(flagIds).toContain('ff_hitl_enabled');
      expect(flagIds).toContain('step_up_enabled');
    });

    it('returns flag metadata (id, label, value, category)', async () => {
      const res = await axios.get(`${BASE_URL}/api/admin/feature-flags`);
      const flag = res.data.flags[0];
      expect(flag.id).toBeDefined();
      expect(typeof flag.value).toBe('boolean');
      expect(flag.category).toBeDefined();
    });
  });

  describe('PATCH /api/admin/feature-flags', () => {
    it('updates a single flag and persists', async () => {
      // Get current value
      const getRes = await axios.get(`${BASE_URL}/api/admin/feature-flags`);
      const currentFlag = getRes.data.flags.find(f => f.id === 'ff_inject_may_act');
      const originalValue = currentFlag.value;

      // Toggle it
      const newValue = !originalValue;
      const patchRes = await axios.patch(`${BASE_URL}/api/admin/feature-flags`, {
        updates: { ff_inject_may_act: newValue }
      });
      expect(patchRes.status).toBe(200);

      // Verify returned value
      const updatedFlag = patchRes.data.flags.find(f => f.id === 'ff_inject_may_act');
      expect(updatedFlag.value).toBe(newValue);

      // Verify persistence via GET
      const verifyRes = await axios.get(`${BASE_URL}/api/admin/feature-flags`);
      const persistedFlag = verifyRes.data.flags.find(f => f.id === 'ff_inject_may_act');
      expect(persistedFlag.value).toBe(newValue);

      // Restore original
      await axios.patch(`${BASE_URL}/api/admin/feature-flags`, {
        updates: { ff_inject_may_act: originalValue }
      });
    });

    it('updates multiple flags at once', async () => {
      const patchRes = await axios.patch(`${BASE_URL}/api/admin/feature-flags`, {
        updates: {
          ff_inject_may_act: true,
          ff_hitl_enabled: false,
          step_up_enabled: true
        }
      });
      expect(patchRes.status).toBe(200);
      expect(patchRes.data.flags.find(f => f.id === 'ff_inject_may_act').value).toBe(true);
      expect(patchRes.data.flags.find(f => f.id === 'ff_hitl_enabled').value).toBe(false);
      expect(patchRes.data.flags.find(f => f.id === 'step_up_enabled').value).toBe(true);
    });

    it('rejects non-boolean flag values', async () => {
      try {
        await axios.patch(`${BASE_URL}/api/admin/feature-flags`, {
          updates: { ff_inject_may_act: 'invalid-string' }
        });
        fail('Expected 400 error for non-boolean value');
      } catch (err) {
        expect(err.response.status).toBe(400);
      }
    });
  });
});
