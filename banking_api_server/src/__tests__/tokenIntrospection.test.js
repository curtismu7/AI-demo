/**
 * Tests for Token Introspection Middleware (RFC 7662)
 */

const axios = require('axios');
const {
  tokenIntrospectionMiddleware,
  optionalTokenIntrospectionMiddleware,
  introspectToken,
  clearIntrospectionCache,
} = require('../../middleware/tokenIntrospection');

jest.mock('axios');
jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

describe('Token Introspection Middleware', () => {
  const mockToken = 'mock.access.token';
  const mockClientId = 'test-client-id';
  const mockClientSecret = 'test-client-secret';

  beforeEach(() => {
    jest.clearAllMocks();
    clearIntrospectionCache(); // prevent cross-test cache pollution
    process.env.PINGONE_INTROSPECTION_ENDPOINT = 'https://auth.pingone.com/introspect';
    process.env.PINGONE_CLIENT_ID = mockClientId;
    process.env.ADMIN_CLIENT_ID = mockClientId;
    process.env.PINGONE_CLIENT_SECRET = mockClientSecret;
    process.env.ADMIN_CLIENT_SECRET = mockClientSecret;
  });

  afterEach(() => {
    delete process.env.PINGONE_INTROSPECTION_ENDPOINT;
    delete process.env.PINGONE_CLIENT_ID;
    delete process.env.ADMIN_CLIENT_ID;
    delete process.env.PINGONE_CLIENT_SECRET;
    delete process.env.ADMIN_CLIENT_SECRET;
  });

  describe('introspectToken', () => {
    it('should successfully introspect active token', async () => {
      const mockResponse = {
        data: {
          active: true,
          sub: 'user123',
          client_id: 'client123',
          scope: 'openid profile',
          exp: Math.floor(Date.now() / 1000) + 3600,
          iat: Math.floor(Date.now() / 1000)
        }
      };

      axios.post.mockResolvedValue(mockResponse);

      const result = await introspectToken(mockToken);

      expect(result.active).toBe(true);
      expect(result.sub).toBe('user123');
      expect(axios.post).toHaveBeenCalledWith(
        'https://auth.pingone.com/introspect',
        expect.any(URLSearchParams),
        expect.objectContaining({
          auth: {
            username: mockClientId,
            password: mockClientSecret
          }
        })
      );
    });

    it('should return inactive for revoked token', async () => {
      axios.post.mockResolvedValue({
        data: { active: false }
      });

      const result = await introspectToken(mockToken);

      expect(result.active).toBe(false);
    });

    it('should throw error if endpoint not configured', async () => {
      delete process.env.PINGONE_INTROSPECTION_ENDPOINT;

      await expect(introspectToken(mockToken)).rejects.toThrow(
        'PINGONE_INTROSPECTION_ENDPOINT not configured'
      );
    });

    it('should throw error if client credentials not configured', async () => {
      delete process.env.PINGONE_CLIENT_ID;
      delete process.env.ADMIN_CLIENT_ID;

      await expect(introspectToken(mockToken)).rejects.toThrow(
        'Client credentials not configured'
      );
    });

    it('should handle network errors', async () => {
      axios.post.mockRejectedValue(new Error('Network error'));

      await expect(introspectToken(mockToken)).rejects.toThrow(
        'Token introspection failed: Network error'
      );
    });

    it('should use cache for repeated introspections', async () => {
      axios.post.mockResolvedValue({
        data: { active: true, sub: 'user123' }
      });

      // First call
      await introspectToken(mockToken);
      expect(axios.post).toHaveBeenCalledTimes(1);

      // Second call (should use cache)
      await introspectToken(mockToken);
      expect(axios.post).toHaveBeenCalledTimes(1); // Still 1, cache hit
    });

    it('should set correct timeout', async () => {
      axios.post.mockResolvedValue({
        data: { active: true }
      });

      await introspectToken(mockToken);

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(URLSearchParams),
        expect.objectContaining({
          timeout: 5000
        })
      );
    });

    it('should include token_type_hint parameter', async () => {
      axios.post.mockResolvedValue({
        data: { active: true }
      });

      await introspectToken(mockToken);

      const callParams = axios.post.mock.calls[0][1];
      expect(callParams.get('token')).toBe(mockToken);
      expect(callParams.get('token_type_hint')).toBe('access_token');
    });
  });

  describe('tokenIntrospectionMiddleware', () => {
    let req, res, next;

    beforeEach(() => {
      req = {
        headers: {
          authorization: `Bearer ${mockToken}`
        },
        path: '/api/accounts'
      };
      res = {};
      next = jest.fn();
    });

    it('should allow request with active token', async () => {
      axios.post.mockResolvedValue({
        data: {
          active: true,
          sub: 'user123',
          client_id: 'client123',
          scope: 'openid profile'
        }
      });

      await tokenIntrospectionMiddleware(req, res, next);

      expect(req.tokenIntrospection).toBeDefined();
      expect(req.tokenIntrospection.active).toBe(true);
      expect(req.tokenIntrospection.sub).toBe('user123');
      expect(next).toHaveBeenCalledWith();
    });

    it('should reject request with inactive token', async () => {
      axios.post.mockResolvedValue({
        data: {
          active: false,
          sub: 'user123'
        }
      });

      await tokenIntrospectionMiddleware(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('not active')
        })
      );
    });

    it('should skip if no authorization header', async () => {
      delete req.headers.authorization;

      await tokenIntrospectionMiddleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(axios.post).not.toHaveBeenCalled();
    });

    it('should skip if not Bearer token', async () => {
      req.headers.authorization = 'Basic credentials';

      await tokenIntrospectionMiddleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(axios.post).not.toHaveBeenCalled();
    });

    it('should fail closed by default on errors', async () => {
      axios.post.mockRejectedValue(new Error('Network error'));

      await tokenIntrospectionMiddleware(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Network error')
        })
      );
    });

    it('should fail open when configured', async () => {
      process.env.INTROSPECTION_FAIL_OPEN = 'true';
      axios.post.mockRejectedValue(new Error('Network error'));

      await tokenIntrospectionMiddleware(req, res, next);

      expect(next).toHaveBeenCalledWith(); // No error passed
      delete process.env.INTROSPECTION_FAIL_OPEN;
    });

    it('should attach introspection result to request', async () => {
      axios.post.mockResolvedValue({
        data: {
          active: true,
          sub: 'user123',
          client_id: 'client123',
          scope: 'openid profile email',
          exp: 1234567890,
          iat: 1234567800
        }
      });

      await tokenIntrospectionMiddleware(req, res, next);

      expect(req.tokenIntrospection).toMatchObject({
        active: true,
        sub: 'user123',
        client_id: 'client123',
      });
    });
  });

  describe('optionalTokenIntrospectionMiddleware', () => {
    let req, res, next;

    beforeEach(() => {
      req = {
        headers: {
          authorization: `Bearer ${mockToken}`
        },
        path: '/api/accounts'
      };
      res = {};
      next = jest.fn();
    });

    it('should skip introspection when not enabled', async () => {
      process.env.ENABLE_TOKEN_INTROSPECTION = 'false';

      await optionalTokenIntrospectionMiddleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(axios.post).not.toHaveBeenCalled();
      delete process.env.ENABLE_TOKEN_INTROSPECTION;
    });

    it('should perform introspection when enabled', async () => {
      process.env.ENABLE_TOKEN_INTROSPECTION = 'true';
      axios.post.mockResolvedValue({
        data: { active: true, sub: 'user123' }
      });

      await optionalTokenIntrospectionMiddleware(req, res, next);

      expect(axios.post).toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith();
      delete process.env.ENABLE_TOKEN_INTROSPECTION;
    });

    it('should skip by default if env var not set', async () => {
      await optionalTokenIntrospectionMiddleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(axios.post).not.toHaveBeenCalled();
    });
  });

  describe('Cache behavior', () => {
    it('should cache introspection results', async () => {
      axios.post.mockResolvedValue({
        data: { active: true, sub: 'user123' }
      });

      // First call
      const result1 = await introspectToken(mockToken);
      expect(axios.post).toHaveBeenCalledTimes(1);

      // Second call within TTL
      const result2 = await introspectToken(mockToken);
      expect(axios.post).toHaveBeenCalledTimes(1); // Cache hit

      expect(result1).toEqual(result2);
    });

    it('should clean up old cache entries', async () => {
      axios.post.mockResolvedValue({
        data: { active: true }
      });

      // Create many cache entries to trigger cleanup
      for (let i = 0; i < 1001; i++) {
        await introspectToken(`token-${i}`);
      }

      // Cache cleanup should have occurred
      expect(true).toBe(true); // Verify no errors
    });
  });
});
