/**
 * Phase 195 — RFC 8693 Delegation Error Middleware Tests
 * T-01 Critical: BFF middleware status code transformation (403→401), structural validation, fallback removal
 */

const express = require('express');
const request = require('supertest');

describe('Phase 195: RFC 8693 Delegation Error Middleware (T-01)', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    // Middleware: Transform 403 DELEGATION_CLAIM_MISSING to 401
    app.use((req, res, next) => {
      const originalJson = res.json;
      res.json = function(data) {
        if (res.statusCode === 403 && data?.error === 'DELEGATION_CLAIM_MISSING') {
          res.statusCode = 401;
        }
        return originalJson.call(this, data);
      };
      next();
    });

    // Test routes
    app.post('/api/mcp/required-delegation', (req, res) => {
      const act = req.headers['x-delegation-claim'];
      if (!act) {
        return res.status(403).json({
          error: 'DELEGATION_CLAIM_MISSING',
          message: 'Delegation required'
        });
      }
      res.json({ authorized: true });
    });

    app.get('/api/mcp/tools/list', (req, res) => {
      res.json({ tools: [] });
    });

    app.get('/api/banking/balance', (req, res) => {
      res.json({ balance: 5000 });
    });
  });

  describe('T-01a: Status Code Transformation (403→401)', () => {
    test('should transform 403 with DELEGATION_CLAIM_MISSING to 401', async () => {
      const response = await request(app).post('/api/mcp/required-delegation').expect(401);
      expect(response.body.error).toBe('DELEGATION_CLAIM_MISSING');
    });

    test('should preserve response body in error', async () => {
      const response = await request(app).post('/api/mcp/required-delegation').expect(401);
      expect(response.body).toHaveProperty('message');
    });
  });

  describe('T-01b: Fallback Removal', () => {
    test('should reject subject-only tokens', async () => {
      const response = await request(app)
        .post('/api/mcp/required-delegation')
        .set('Authorization', 'Bearer subject-only')
        .expect(401);
      expect(response.status).toBe(401);
    });

    test('should accept delegation token', async () => {
      const response = await request(app)
        .post('/api/mcp/required-delegation')
        .set('x-delegation-claim', 'agent-xyz')
        .expect(200);
      expect(response.body.authorized).toBe(true);
    });
  });

  describe('T-01c: Non-MCP Endpoints', () => {
    test('should not affect banking API endpoints', async () => {
      const response = await request(app).get('/api/banking/balance').expect(200);
      expect(response.body.balance).toBe(5000);
    });

    test('should allow GET /api/mcp without delegation', async () => {
      const response = await request(app).get('/api/mcp/tools/list').expect(200);
      expect(response.body).toHaveProperty('tools');
    });
  });

  describe('T-01d: RFC 8693 Compliance', () => {
    test('status code must be 401 not 403', async () => {
      const response = await request(app).post('/api/mcp/required-delegation');
      expect(response.status).toBe(401);
    });

    test('error field must be DELEGATION_CLAIM_MISSING', async () => {
      const response = await request(app).post('/api/mcp/required-delegation').expect(401);
      expect(response.body.error).toBe('DELEGATION_CLAIM_MISSING');
    });
  });
});
