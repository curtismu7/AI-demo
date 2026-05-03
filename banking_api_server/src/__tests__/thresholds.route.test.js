describe('Thresholds Route', () => {
  const server = require('../../../server');
  const axios = require('axios');
  const runtimeSettings = require('../../../config/runtimeSettings');
  const configStore = require('../../../services/configStore');
  const BASE_URL = `http://localhost:${process.env.PORT || 3001}`;

  beforeAll(async () => {
    await new Promise((resolve) => server.listen(3001, resolve));
  });

  afterAll(() => {
    server.close();
  });

  describe('GET /api/config/thresholds', () => {
    it('returns current thresholds', async () => {
      const res = await axios.get(`${BASE_URL}/api/config/thresholds`);
      expect(res.status).toBe(200);
      expect(res.data.confirm_threshold_usd).toBeDefined();
      expect(res.data.mfa_threshold_usd).toBeDefined();
    });

    it('returns thresholds as strings', async () => {
      const res = await axios.get(`${BASE_URL}/api/config/thresholds`);
      expect(typeof res.data.confirm_threshold_usd).toBe('string');
      expect(typeof res.data.mfa_threshold_usd).toBe('string');
    });
  });

  describe('POST /api/config/thresholds', () => {
    it('updates confirm_threshold_usd', async () => {
      const newValue = '9999';
      const postRes = await axios.post(`${BASE_URL}/api/config/thresholds`, {
        confirm_threshold_usd: newValue
      });
      expect(postRes.status).toBe(200);
      expect(postRes.data.confirm_threshold_usd).toBe(newValue);

      // Verify persistence via GET
      const getRes = await axios.get(`${BASE_URL}/api/config/thresholds`);
      expect(getRes.data.confirm_threshold_usd).toBe(newValue);

      // Reset to default
      await axios.post(`${BASE_URL}/api/config/thresholds`, {
        confirm_threshold_usd: '500'
      });
    });

    it('updates mfa_threshold_usd and syncs to runtimeSettings', async () => {
      const newValue = 1500;
      const postRes = await axios.post(`${BASE_URL}/api/config/thresholds`, {
        mfa_threshold_usd: newValue
      });
      expect(postRes.status).toBe(200);

      // Verify runtimeSettings updated immediately (live effect)
      const rtThreshold = runtimeSettings.get('stepUpAmountThreshold');
      expect(rtThreshold).toBe(newValue);

      // Reset
      await axios.post(`${BASE_URL}/api/config/thresholds`, {
        mfa_threshold_usd: 500
      });
    });

    it('updates both thresholds at once', async () => {
      const postRes = await axios.post(`${BASE_URL}/api/config/thresholds`, {
        confirm_threshold_usd: '750',
        mfa_threshold_usd: 1000
      });
      expect(postRes.status).toBe(200);
      expect(postRes.data.confirm_threshold_usd).toBe('750');
      expect(postRes.data.mfa_threshold_usd).toBe('1000');

      // Reset
      await axios.post(`${BASE_URL}/api/config/thresholds`, {
        confirm_threshold_usd: '500',
        mfa_threshold_usd: 500
      });
    });

    it('rejects non-numeric threshold values', async () => {
      try {
        await axios.post(`${BASE_URL}/api/config/thresholds`, {
          mfa_threshold_usd: 'not-a-number'
        });
        fail('Expected 400 error for non-numeric threshold');
      } catch (err) {
        expect(err.response.status).toBe(400);
      }
    });

    it('rejects negative thresholds', async () => {
      try {
        await axios.post(`${BASE_URL}/api/config/thresholds`, {
          mfa_threshold_usd: -100
        });
        fail('Expected 400 error for negative threshold');
      } catch (err) {
        expect(err.response.status).toBe(400);
      }
    });
  });
});
