/**
 * @file mcpDecisionPolling.test.js
 * Tests for HITL decision polling routes + in-memory store.
 */

'use strict';

const express = require('express');
const session = require('express-session');
const request = require('supertest');
const mcpDecisionPollingRouter = require('../../routes/mcpDecisionPolling');
const { createPendingDecision, getDecision } = require('../../routes/mcpDecisionPolling');

function createApp(sessionUser = null) {
  const app = express();
  app.use(session({
    secret: 'test-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false },
  }));
  // Middleware to inject test session
  app.use((req, _res, next) => {
    if (sessionUser) {
      req.session.user = sessionUser;
    }
    next();
  });
  app.use('/api/mcp', mcpDecisionPollingRouter);
  return app;
}

const USER_A = { oauthId: 'user-aaa', id: 'user-aaa', role: 'user' };
const USER_B = { oauthId: 'user-bbb', id: 'user-bbb', role: 'user' };

describe('HITL Decision Polling — in-memory store', () => {
  describe('createPendingDecision()', () => {
    it('creates a decision with pending status and returns taskId', () => {
      const { taskId } = createPendingDecision('user-123', {
        tool: 'create_transfer',
        decisionId: 'dec-1',
        reason: 'High-value transfer',
      });
      expect(taskId).toBeDefined();
      expect(typeof taskId).toBe('string');
      expect(taskId.length).toBeGreaterThan(10); // UUID

      const d = getDecision(taskId);
      expect(d.status).toBe('pending');
      expect(d.userSub).toBe('user-123');
      expect(d.tool).toBe('create_transfer');
      expect(d.reason).toBe('High-value transfer');
    });

    it('creates unique taskIds', () => {
      const a = createPendingDecision('u1', {});
      const b = createPendingDecision('u1', {});
      expect(a.taskId).not.toBe(b.taskId);
    });
  });

  describe('getDecision()', () => {
    it('returns null for unknown taskId', () => {
      expect(getDecision('nonexistent-id')).toBeNull();
    });

    it('returns the decision for valid taskId', () => {
      const { taskId } = createPendingDecision('u1', { tool: 'check_balance' });
      const d = getDecision(taskId);
      expect(d).not.toBeNull();
      expect(d.status).toBe('pending');
    });
  });
});

describe('HITL Decision Polling — HTTP routes', () => {
  // ── Authentication ───────────────────────────────────────

  it('GET /decision/:taskId returns 401 without session', async () => {
    const app = createApp(null); // No user session
    const { taskId } = createPendingDecision('u1', {});
    const res = await request(app).get(`/api/mcp/decision/${taskId}`);
    expect(res.status).toBe(401);
  });

  it('POST /decision/:taskId/approve returns 401 without session', async () => {
    const app = createApp(null);
    const { taskId } = createPendingDecision('u1', {});
    const res = await request(app).post(`/api/mcp/decision/${taskId}/approve`);
    expect(res.status).toBe(401);
  });

  it('POST /decision/:taskId/deny returns 401 without session', async () => {
    const app = createApp(null);
    const { taskId } = createPendingDecision('u1', {});
    const res = await request(app).post(`/api/mcp/decision/${taskId}/deny`);
    expect(res.status).toBe(401);
  });

  // ── GET /decision/:taskId ────────────────────────────────

  describe('GET /decision/:taskId', () => {
    it('returns 200 with pending status for own decision', async () => {
      const app = createApp(USER_A);
      const { taskId } = createPendingDecision(USER_A.oauthId, {
        tool: 'get_balance',
        reason: 'Approval required',
      });

      const res = await request(app).get(`/api/mcp/decision/${taskId}`);
      expect(res.status).toBe(200);
      expect(res.body.taskId).toBe(taskId);
      expect(res.body.status).toBe('pending');
      expect(res.body.tool).toBe('get_balance');
      expect(res.body.reason).toBe('Approval required');
    });

    it('returns 404 for nonexistent taskId', async () => {
      const app = createApp(USER_A);
      const res = await request(app).get('/api/mcp/decision/does-not-exist');
      expect(res.status).toBe(404);
    });

    it('returns 403 when another user tries to poll', async () => {
      const app = createApp(USER_B); // User B
      const { taskId } = createPendingDecision(USER_A.oauthId, {}); // Owned by User A
      const res = await request(app).get(`/api/mcp/decision/${taskId}`);
      expect(res.status).toBe(403);
    });
  });

  // ── POST /decision/:taskId/approve ───────────────────────

  describe('POST /decision/:taskId/approve', () => {
    it('approves a pending decision', async () => {
      const app = createApp(USER_A);
      const { taskId } = createPendingDecision(USER_A.oauthId, { tool: 'transfer' });

      const res = await request(app).post(`/api/mcp/decision/${taskId}/approve`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('approved');
      expect(res.body.taskId).toBe(taskId);

      // Verify stored state changed
      const d = getDecision(taskId);
      expect(d.status).toBe('approved');
      expect(d.resolvedBy).toBe(USER_A.oauthId);
    });

    it('returns 404 for nonexistent taskId', async () => {
      const app = createApp(USER_A);
      const res = await request(app).post('/api/mcp/decision/nope/approve');
      expect(res.status).toBe(404);
    });

    it('returns 403 for wrong user', async () => {
      const app = createApp(USER_B);
      const { taskId } = createPendingDecision(USER_A.oauthId, {});
      const res = await request(app).post(`/api/mcp/decision/${taskId}/approve`);
      expect(res.status).toBe(403);
    });

    it('returns 409 when already resolved', async () => {
      const app = createApp(USER_A);
      const { taskId } = createPendingDecision(USER_A.oauthId, {});

      // Approve first
      await request(app).post(`/api/mcp/decision/${taskId}/approve`);
      // Try again
      const res = await request(app).post(`/api/mcp/decision/${taskId}/approve`);
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('already_resolved');
    });
  });

  // ── POST /decision/:taskId/deny ──────────────────────────

  describe('POST /decision/:taskId/deny', () => {
    it('denies a pending decision', async () => {
      const app = createApp(USER_A);
      const { taskId } = createPendingDecision(USER_A.oauthId, { tool: 'transfer' });

      const res = await request(app).post(`/api/mcp/decision/${taskId}/deny`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('denied');

      const d = getDecision(taskId);
      expect(d.status).toBe('denied');
    });

    it('returns 403 for wrong user', async () => {
      const app = createApp(USER_B);
      const { taskId } = createPendingDecision(USER_A.oauthId, {});
      const res = await request(app).post(`/api/mcp/decision/${taskId}/deny`);
      expect(res.status).toBe(403);
    });

    it('returns 409 when already denied', async () => {
      const app = createApp(USER_A);
      const { taskId } = createPendingDecision(USER_A.oauthId, {});
      await request(app).post(`/api/mcp/decision/${taskId}/deny`);
      const res = await request(app).post(`/api/mcp/decision/${taskId}/deny`);
      expect(res.status).toBe(409);
    });
  });

  // ── Cross-state: approve then deny (or vice versa) ──────

  it('cannot deny after approve', async () => {
    const app = createApp(USER_A);
    const { taskId } = createPendingDecision(USER_A.oauthId, {});
    await request(app).post(`/api/mcp/decision/${taskId}/approve`);
    const res = await request(app).post(`/api/mcp/decision/${taskId}/deny`);
    expect(res.status).toBe(409);
    expect(getDecision(taskId).status).toBe('approved');
  });

  it('cannot approve after deny', async () => {
    const app = createApp(USER_A);
    const { taskId } = createPendingDecision(USER_A.oauthId, {});
    await request(app).post(`/api/mcp/decision/${taskId}/deny`);
    const res = await request(app).post(`/api/mcp/decision/${taskId}/approve`);
    expect(res.status).toBe(409);
    expect(getDecision(taskId).status).toBe('denied');
  });
});
