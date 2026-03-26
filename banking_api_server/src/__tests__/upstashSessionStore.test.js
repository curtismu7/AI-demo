/**
 * upstashSessionStore.test.js
 *
 * Unit tests for the UpstashSessionStore (HTTP-based session persistence for Vercel).
 * The @vercel/kv client is mocked so no real network calls are made.
 */

'use strict';

// ── Mock @vercel/kv before requiring the store ────────────────────────
const mockKv = {
  get:    jest.fn(),
  set:    jest.fn(),
  del:    jest.fn(),
  expire: jest.fn(),
};

jest.mock('@vercel/kv', () => ({
  createClient: jest.fn().mockReturnValue(mockKv),
}));

// Set required env vars before the module loads
process.env.UPSTASH_REDIS_REST_URL   = 'https://test.upstash.io';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';

const UpstashSessionStore = require('../../services/upstashSessionStore');

describe('UpstashSessionStore', () => {
  let store;

  beforeEach(() => {
    jest.clearAllMocks();
    store = new UpstashSessionStore({ prefix: 'test:sess:' });
  });

  // ── Constructor ─────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('sets storeType to upstash-rest', () => {
      expect(store.storeType).toBe('upstash-rest');
    });

    it('uses the provided prefix', () => {
      expect(store.prefix).toBe('test:sess:');
    });

    it('defaults prefix to banking:sess: when not provided', () => {
      const s = new UpstashSessionStore();
      expect(s.prefix).toBe('banking:sess:');
    });

    it('throws when URL and token are missing', () => {
      const orig  = process.env.UPSTASH_REDIS_REST_URL;
      const orig2 = process.env.UPSTASH_REDIS_REST_TOKEN;
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
      delete process.env.KV_REST_API_URL;
      delete process.env.KV_REST_API_TOKEN;
      expect(() => new UpstashSessionStore()).toThrow('UpstashSessionStore requires');
      process.env.UPSTASH_REDIS_REST_URL   = orig;
      process.env.UPSTASH_REDIS_REST_TOKEN = orig2;
    });
  });

  // ── get() ────────────────────────────────────────────────────────────────

  describe('get()', () => {
    it('returns session data on hit', (done) => {
      const session = { user: { id: 'u1' }, oauthTokens: { accessToken: 'tok' } };
      mockKv.get.mockResolvedValue(session);

      store.get('sid123', (err, data) => {
        expect(err).toBeNull();
        expect(data).toEqual(session);
        expect(mockKv.get).toHaveBeenCalledWith('test:sess:sid123');
        done();
      });
    });

    it('returns null on cache miss', (done) => {
      mockKv.get.mockResolvedValue(null);
      store.get('sid-miss', (err, data) => {
        expect(err).toBeNull();
        expect(data).toBeNull();
        done();
      });
    });

    it('returns null (not error) when Upstash throws — regression: Redis errors must not cause 500', (done) => {
      // Regression: before this store, node-redis get errors propagated to
      // express-session as cb(err) → next(err) → 500 server_error response.
      mockKv.get.mockRejectedValue(new Error('Upstash fetch failed'));
      store.get('sid-err', (err, data) => {
        expect(err).toBeNull(); // error must NOT propagate
        expect(data).toBeNull(); // empty session → 401, not 500
        done();
      });
    });
  });

  // ── set() ────────────────────────────────────────────────────────────────

  describe('set()', () => {
    const sessionData = {
      user: { id: 'u1' },
      cookie: { maxAge: 3600000 }, // 1 hour in ms
    };

    it('writes session with correct TTL derived from cookie.maxAge', (done) => {
      mockKv.set.mockResolvedValue('OK');
      store.set('sid1', sessionData, (err) => {
        expect(err).toBeNull();
        expect(mockKv.set).toHaveBeenCalledWith(
          'test:sess:sid1',
          sessionData,
          { ex: 3600 }, // 1 hour in seconds
        );
        done();
      });
    });

    it('uses default TTL (86400 s) when cookie.maxAge is absent', (done) => {
      mockKv.set.mockResolvedValue('OK');
      store.set('sid2', { user: { id: 'u2' } }, (err) => {
        expect(err).toBeNull();
        const call = mockKv.set.mock.calls[0];
        expect(call[2]).toEqual({ ex: 86400 });
        done();
      });
    });

    it('calls cb(null) and does NOT propagate error — regression: prevents ?error=session_error', (done) => {
      // Regression: before the fault-tolerant store, a Redis write error here caused
      // session.save(cb) to call cb(err), which the login route treated as fatal,
      // redirecting to ?error=session_error before the user reached PingOne.
      mockKv.set.mockRejectedValue(new Error('Upstash write timeout'));
      store.set('sid3', sessionData, (err) => {
        expect(err).toBeNull(); // error swallowed — session.save() succeeds silently
        done();
      });
    });
  });

  // ── destroy() ────────────────────────────────────────────────────────────

  describe('destroy()', () => {
    it('deletes the session key', (done) => {
      mockKv.del.mockResolvedValue(1);
      store.destroy('sid1', (err) => {
        expect(err).toBeNull();
        expect(mockKv.del).toHaveBeenCalledWith('test:sess:sid1');
        done();
      });
    });

    it('calls cb(null) even when del throws', (done) => {
      mockKv.del.mockRejectedValue(new Error('del failed'));
      store.destroy('sid1', (err) => {
        expect(err).toBeNull();
        done();
      });
    });

    it('does not throw when cb is undefined', () => {
      mockKv.del.mockResolvedValue(1);
      expect(() => store.destroy('sid1', undefined)).not.toThrow();
    });
  });

  // ── touch() ──────────────────────────────────────────────────────────────

  describe('touch()', () => {
    it('refreshes TTL via expire', (done) => {
      mockKv.expire.mockResolvedValue(1);
      store.touch('sid1', { cookie: { maxAge: 7200000 } }, (err) => {
        expect(err).toBeNull();
        expect(mockKv.expire).toHaveBeenCalledWith('test:sess:sid1', 7200);
        done();
      });
    });

    it('does not throw when expire fails', (done) => {
      mockKv.expire.mockRejectedValue(new Error('expire failed'));
      store.touch('sid1', {}, () => done());
    });
  });

  // ── getPersistenceDebug() ────────────────────────────────────────────────

  describe('getPersistenceDebug()', () => {
    it('returns no_session_id when sid is missing', async () => {
      const r = await store.getPersistenceDebug(null);
      expect(r.redisReadSkipped).toBe('no_session_id');
    });

    it('returns redisKeyPresent false when key missing', async () => {
      mockKv.get.mockResolvedValue(null);
      const r = await store.getPersistenceDebug('sid-abc');
      expect(r.redisKeyPresent).toBe(false);
      expect(mockKv.get).toHaveBeenCalledWith('test:sess:sid-abc');
    });

    it('summarizes redis session without exposing raw token strings', async () => {
      mockKv.get.mockResolvedValue({
        user: { id: '1' },
        oauthType: 'user',
        oauthTokens: {
          accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.sig',
          refreshToken: 'rt',
          expiresAt: Date.now() + 60000,
        },
      });
      const r = await store.getPersistenceDebug('sid1');
      expect(r.redisKeyPresent).toBe(true);
      expect(r.redisHasUser).toBe(true);
      expect(r.redisAccessTokenStub).toBe(false);
      expect(r.redisHasRefreshToken).toBe(true);
      expect(r.approxPayloadBytes).toBeGreaterThan(100);
      expect(JSON.stringify(r)).not.toContain('eyJ');
    });

    it('detects stub token in redis blob', async () => {
      mockKv.get.mockResolvedValue({
        user: { id: '1' },
        oauthTokens: { accessToken: '_cookie_session' },
      });
      const r = await store.getPersistenceDebug('sid1');
      expect(r.redisAccessTokenStub).toBe(true);
    });
  });

  // ── ping() ───────────────────────────────────────────────────────────────

  describe('ping()', () => {
    it('returns { healthy: true, error: null } when store is healthy', async () => {
      mockKv.set.mockResolvedValue('OK');
      mockKv.get.mockResolvedValue('1');
      const result = await store.ping();
      expect(result).toEqual({ healthy: true, error: null, circuit: 'CLOSED' });
    });

    it('returns { healthy: false } with error message when store is unreachable', async () => {
      mockKv.set.mockRejectedValue(new Error('connection refused'));
      const result = await store.ping();
      expect(result.healthy).toBe(false);
      expect(result.error).toContain('connection refused');
    });

    it('returns { healthy: false } with error when ping value does not match', async () => {
      mockKv.set.mockResolvedValue('OK');
      mockKv.get.mockResolvedValue(null); // value not stored correctly
      const result = await store.ping();
      expect(result.healthy).toBe(false);
      expect(result.error).toContain('unexpected ping value');
    });
  });

  // ── _ttl() ───────────────────────────────────────────────────────────────

  describe('_ttl()', () => {
    it('rounds up fractional seconds from maxAge', () => {
      expect(store._ttl({ cookie: { maxAge: 3600001 } })).toBe(3601);
    });

    it('uses defaultTtl when cookie is absent', () => {
      expect(store._ttl({})).toBe(86400);
      expect(store._ttl(null)).toBe(86400);
    });
  });
});
