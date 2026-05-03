describe('Demo Controls Integration — Agent Honors Thresholds & Flags', () => {
  const server = require('../../../server');
  const axios = require('axios');
  const runtimeSettings = require('../../../config/runtimeSettings');
  const configStore = require('../../../services/configStore');
  const BASE_URL = `http://localhost:${process.env.PORT || 3001}`;

  let sessionCookie = '';

  beforeAll(async () => {
    await new Promise((resolve) => server.listen(3001, resolve));
    // TODO: Set up authenticated session for tests
  });

  afterAll(() => {
    server.close();
  });

  describe('Consent threshold enforcement', () => {
    it('HITL required when amount exceeds consent threshold', async () => {
      // Set threshold to $500
      await axios.post(`${BASE_URL}/api/config/thresholds`, {
        confirm_threshold_usd: '500'
      });

      // Attempt $600 withdrawal without consent
      try {
        await axios.post(`${BASE_URL}/api/transactions`, {
          type: 'withdrawal',
          fromAccountId: '1',
          amount: 600.00
        }, {
          headers: { Cookie: sessionCookie }
        });
        fail('Expected 428 consent_challenge_required');
      } catch (err) {
        expect(err.response.status).toBe(428);
        expect(err.response.data.error).toBe('consent_challenge_required');
      }
    });

    it('HITL NOT required when amount below consent threshold', async () => {
      // Set threshold to $5000 (high)
      await axios.post(`${BASE_URL}/api/config/thresholds`, {
        confirm_threshold_usd: '5000'
      });

      // $100 withdrawal should pass without consent
      // (Note: this test assumes withdrawal < threshold doesn't require other auth)
      const res = await axios.post(`${BASE_URL}/api/transactions`, {
        type: 'withdrawal',
        fromAccountId: '1',
        amount: 100.00
      }, {
        headers: { Cookie: sessionCookie }
      });
      // Should succeed (200) or fail for unrelated reason, not 428
      expect(res.status).not.toBe(428);
    });

    it('Dynamic threshold changes take effect immediately', async () => {
      const originalThreshold = parseFloat(configStore.getEffective('confirm_threshold_usd'));

      // Change threshold
      await axios.post(`${BASE_URL}/api/config/thresholds`, {
        confirm_threshold_usd: '1000'
      });

      // Verify runtimeSettings reflects change immediately
      const updatedThreshold = configStore.getEffective('confirm_threshold_usd');
      expect(parseFloat(updatedThreshold)).toBe(1000);

      // Restore
      await axios.post(`${BASE_URL}/api/config/thresholds`, {
        confirm_threshold_usd: String(originalThreshold)
      });
    });
  });

  describe('MFA threshold enforcement', () => {
    it('Step-up required when amount exceeds MFA threshold', async () => {
      // Set MFA threshold to $250
      await axios.post(`${BASE_URL}/api/config/thresholds`, {
        mfa_threshold_usd: 250
      });

      // Attempt $500 transfer without MFA (wrong ACR)
      try {
        await axios.post(`${BASE_URL}/api/transactions`, {
          type: 'transfer',
          fromAccountId: '1',
          toAccountId: '2',
          amount: 500.00
        }, {
          headers: { Cookie: sessionCookie }
        });
        fail('Expected 428 step_up_required');
      } catch (err) {
        expect(err.response.status).toBe(428);
        expect(err.response.data.error).toBe('step_up_required');
      }
    });

    it('Step-up NOT required when amount below MFA threshold', async () => {
      // Set MFA threshold to $10000 (very high)
      await axios.post(`${BASE_URL}/api/config/thresholds`, {
        mfa_threshold_usd: 10000
      });

      // $100 transfer should pass without MFA
      const res = await axios.post(`${BASE_URL}/api/transactions`, {
        type: 'transfer',
        fromAccountId: '1',
        toAccountId: '2',
        amount: 100.00
      }, {
        headers: { Cookie: sessionCookie }
      });
      expect(res.status).not.toBe(428);
    });
  });

  describe('Feature flag enforcement', () => {
    it('step_up_enabled flag disables MFA gate when false', async () => {
      // Disable step-up via flag
      await axios.patch(`${BASE_URL}/api/admin/feature-flags`, {
        updates: { step_up_enabled: false }
      });

      // High-value transfer should NOT require MFA now
      const res = await axios.post(`${BASE_URL}/api/transactions`, {
        type: 'transfer',
        fromAccountId: '1',
        toAccountId: '2',
        amount: 5000.00
      }, {
        headers: { Cookie: sessionCookie }
      });
      expect(res.status).not.toBe(428);

      // Restore flag
      await axios.patch(`${BASE_URL}/api/admin/feature-flags`, {
        updates: { step_up_enabled: true }
      });
    });

    it('ff_hitl_enabled flag disables HITL gate when false', async () => {
      // Disable HITL via flag
      await axios.patch(`${BASE_URL}/api/admin/feature-flags`, {
        updates: { ff_hitl_enabled: false }
      });

      // High-value withdrawal should NOT require consent now
      const res = await axios.post(`${BASE_URL}/api/transactions`, {
        type: 'withdrawal',
        fromAccountId: '1',
        amount: 5000.00
      }, {
        headers: { Cookie: sessionCookie }
      });
      expect(res.status).not.toBe(428);

      // Restore flag
      await axios.patch(`${BASE_URL}/api/admin/feature-flags`, {
        updates: { ff_hitl_enabled: true }
      });
    });

    it('ff_inject_may_act flag controls token exchange behavior', async () => {
      // Enable may_act injection
      await axios.patch(`${BASE_URL}/api/admin/feature-flags`, {
        updates: { ff_inject_may_act: true }
      });

      // Next MCP call should include injected may_act
      // (implementation-specific verification)

      // Disable it
      await axios.patch(`${BASE_URL}/api/admin/feature-flags`, {
        updates: { ff_inject_may_act: false }
      });

      // Next MCP call should NOT inject may_act
      // (implementation-specific verification)
    });
  });

  describe('Admin bypass', () => {
    it('admin role bypasses both HITL and step-up gates', async () => {
      // TODO: Create admin session
      // High-value transaction should pass regardless of thresholds
    });
  });
});
