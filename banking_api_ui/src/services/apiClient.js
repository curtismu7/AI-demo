import axios from 'axios';
import { resolveApiBaseUrl } from '../utils/resolveApiBaseUrl';
import { appendTrafficEntry, redactHeaders, redactBody, tryParseJson, normalizeHeaders } from './apiTrafficStore';

class ApiClient {
  constructor() {
    this.client = axios.create({
      baseURL: resolveApiBaseUrl(),
      timeout: 10000,
      withCredentials: true,
    });

    this.setupInterceptors();
  }

  setupInterceptors() {
    // ── Traffic capture — stamp request start time ────────────────────────────
    this.client.interceptors.request.use(
      (config) => { config._trafficStart = Date.now(); return config; },
      (error) => Promise.reject(error)
    );

    // Request interceptor to add OAuth token
    this.client.interceptors.request.use(
      async (config) => {
        const token = await this.getValidToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // ── Traffic capture — record response (success + error) ───────────────────
    this.client.interceptors.response.use(
      (response) => {
        const cfg = response.config || {};
        const url = cfg.url || '';
        if (url.startsWith('/api/')) {
          let reqBody = cfg.data;
          if (typeof reqBody === 'string') reqBody = tryParseJson(reqBody) ?? reqBody;
          if (reqBody && typeof reqBody === 'object') reqBody = redactBody(reqBody);
          appendTrafficEntry({
            method: (cfg.method || 'GET').toUpperCase(),
            url,
            status: response.status,
            duration: cfg._trafficStart ? Date.now() - cfg._trafficStart : null,
            requestHeaders: redactHeaders(normalizeHeaders(cfg.headers || {})),
            requestBody: reqBody ?? null,
            responseHeaders: normalizeHeaders(response.headers),
            responseBody: response.data ?? null,
            source: 'axios',
            timestamp: new Date().toISOString(),
          });
        }
        return response;
      },
      async (error) => {
        const cfg = error.config || {};
        const url = cfg.url || '';
        if (url.startsWith('/api/')) {
          let errReqBody = cfg.data ? (tryParseJson(cfg.data) ?? cfg.data) : null;
          if (errReqBody && typeof errReqBody === 'object') errReqBody = redactBody(errReqBody);
          appendTrafficEntry({
            method: (cfg.method || 'GET').toUpperCase(),
            url,
            status: error.response?.status ?? 0,
            duration: cfg._trafficStart ? Date.now() - cfg._trafficStart : null,
            requestHeaders: redactHeaders(normalizeHeaders(cfg.headers || {})),
            requestBody: errReqBody,
            responseHeaders: normalizeHeaders(error.response?.headers),
            responseBody: error.response?.data ?? null,
            error: error.message,
            source: 'axios',
            timestamp: new Date().toISOString(),
          });
        }

        // ── Original error handling ──────────────────────────────────────────
        const originalRequest = error.config;

        // Check if error is due to token expiration (401) and we haven't already tried to refresh
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;
          try {
            const newToken = await this.refreshToken();
            if (newToken) {
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
              return this.client(originalRequest);
            }
          } catch (refreshError) {
            console.error('Token refresh failed:', refreshError);
            // Do not redirect: refresh often returns 501 (not implemented) or 401 while the
            // Backend-for-Frontend (BFF) session cookie is still valid. Let the caller surface the original 401.
            return Promise.reject(error);
          }
        }

        // Check for insufficient scope errors (403)
        if (error.response?.status === 403) {
          console.error('Insufficient scope for request:', error.response.data);
          if (error.response.data?.error === 'insufficient_scope') {
            const scopeError = new Error('Insufficient permissions for this operation');
            scopeError.response = error.response;
            scopeError.requiredScopes = error.response.data?.required_scopes;
            scopeError.providedScopes = error.response.data?.provided_scopes;
            return Promise.reject(scopeError);
          }
        }

        return Promise.reject(error);
      }
    );
  }

  async getValidToken() {
    // Backend-for-Frontend (BFF) pattern: same-origin /api/* calls use the session cookie; the server reads the
    // access token from req.session. Do not send Authorization: Bearer from a JWT copy
    // exposed via /oauth/status — it can be expired while the session token is still valid,
    // causing 401 and a broken refresh flow that redirected to home.
    return null;
  }

  async getTokenFromSession() {
    try {
      // Try end user OAuth session first
      const userResponse = await axios.get('/api/auth/oauth/user/status');
      if (userResponse.data.authenticated && userResponse.data.accessToken) {
        return userResponse.data.accessToken;
      }

      // Try admin OAuth session as fallback
      const adminResponse = await axios.get('/api/auth/oauth/status');
      if (adminResponse.data.authenticated && adminResponse.data.accessToken) {
        return adminResponse.data.accessToken;
      }

      return null;
    } catch (error) {
      console.error('Error getting token from session:', error);
      return null;
    }
  }

  isTokenExpired(_token) {
    // OAuth access tokens are opaque here; rely on the Backend-for-Frontend (BFF)/session for validity.
    return false;
  }

  async refreshToken() {
    try {
      // Try to refresh the end user token first
      try {
        const userRefreshResponse = await axios.post('/api/auth/oauth/user/refresh');
        if (userRefreshResponse.data.accessToken) {
          console.log('Successfully refreshed end user token');
          return userRefreshResponse.data.accessToken;
        }
      } catch (userRefreshError) {
        console.log('End user token refresh failed:', userRefreshError.response?.data?.error || userRefreshError.message);
        // If refresh is not implemented (501) or no refresh token (401), don't try admin refresh
        if (userRefreshError.response?.status === 501 || userRefreshError.response?.status === 401) {
          throw userRefreshError;
        }
      }

      // Try to refresh the admin token
      try {
        const adminRefreshResponse = await axios.post('/api/auth/oauth/refresh');
        if (adminRefreshResponse.data.accessToken) {
          console.log('Successfully refreshed admin token');
          return adminRefreshResponse.data.accessToken;
        }
      } catch (adminRefreshError) {
        console.log('Admin token refresh failed:', adminRefreshError.response?.data?.error || adminRefreshError.message);
        throw adminRefreshError;
      }

      throw new Error('All token refresh attempts failed');
    } catch (error) {
      console.error('Token refresh failed:', error);
      if (error.response?.status === 501) {
        console.log('Token refresh not implemented');
      } else if (error.response?.status === 401) {
        console.log('No refresh token available');
      }
      throw error;
    }
  }

  handleAuthFailure() {
    console.log('Authentication failed, redirecting to login');
    localStorage.setItem('userLoggedOut', 'true');
    delete axios.defaults.headers.common['Authorization'];
    window.dispatchEvent(new CustomEvent('userLoggedOut'));
    setTimeout(() => { window.location.href = '/'; }, 100);
  }

  // Convenience methods that use the configured client
  get(url, config) { return this.client.get(url, config); }
  post(url, data, config) { return this.client.post(url, data, config); }
  put(url, data, config) { return this.client.put(url, data, config); }
  delete(url, config) { return this.client.delete(url, config); }
  patch(url, data, config) { return this.client.patch(url, data, config); }
}

// Create and export a singleton instance
const apiClient = new ApiClient();
export default apiClient;
