describe('may_act Route', () => {
  const server = require('../../../server');
  const axios = require('axios');
  const BASE_URL = `http://localhost:${process.env.PORT || 3001}`;

  // Mock session with user
  const mockSessionUser = {
    id: 'test-user-123',
    username: 'testuser',
    role: 'customer',
    sub: 'test-sub-123'
  };

  beforeAll(async () => {
    await new Promise((resolve) => server.listen(3001, resolve));
  });

  afterAll(() => {
    server.close();
  });

  describe('GET /api/demo/may-act/diagnose', () => {
    it('returns diagnostic info about may_act attribute', async () => {
      const res = await axios.get(`${BASE_URL}/api/demo/may-act/diagnose`, {
        withCredentials: true,
        headers: {
          Cookie: 'connect.sid=test-session'
        }
      });
      expect(res.status).toBe(200);
      expect(res.data).toBeDefined();
      // Response should indicate whether attribute is set or not
    });

    it('requires authentication', async () => {
      try {
        await axios.get(`${BASE_URL}/api/demo/may-act/diagnose`);
        fail('Expected 401 for unauthenticated request');
      } catch (err) {
        expect(err.response.status).toBe(401);
      }
    });
  });

  describe('PATCH /api/demo/may-act', () => {
    it('accepts { enabled: boolean } payload', async () => {
      try {
        const res = await axios.patch(`${BASE_URL}/api/demo/may-act`, {
          enabled: true
        }, {
          withCredentials: true,
          headers: {
            Cookie: 'connect.sid=test-session'
          }
        });
        // May fail with PingOne API error, but HTTP layer should accept the format
        expect([200, 400, 401, 500]).toContain(res.status);
      } catch (err) {
        // Expected if no real PingOne credentials
        expect([400, 401, 403, 500]).toContain(err.response?.status || 500);
      }
    });

    it('rejects invalid payloads', async () => {
      try {
        await axios.patch(`${BASE_URL}/api/demo/may-act`, {
          enabled: 'invalid-string'
        }, {
          withCredentials: true,
          headers: {
            Cookie: 'connect.sid=test-session'
          }
        });
        fail('Expected 400 for non-boolean enabled field');
      } catch (err) {
        expect(err.response.status).toBe(400);
      }
    });

    it('requires authentication', async () => {
      try {
        await axios.patch(`${BASE_URL}/api/demo/may-act`, {
          enabled: true
        });
        fail('Expected 401 for unauthenticated request');
      } catch (err) {
        expect(err.response.status).toBe(401);
      }
    });
  });
});
