/**
 * @file oauthAuthorizeResource.test.js
 * Guards against PingOne invalid_scope when OIDC + API scopes are combined with &resource= on /authorize.
 */

const {
  buildPingOneAuthorizeResourceQueryParam,
} = require('../../utils/oauthAuthorizeResource');

describe('buildPingOneAuthorizeResourceQueryParam (PingOne /authorize resource)', () => {
  const audience = 'https://example.com/banking-api';

  it('returns empty string when audience is missing', () => {
    expect(buildPingOneAuthorizeResourceQueryParam('', ['openid', 'banking:read'])).toBe('');
    expect(buildPingOneAuthorizeResourceQueryParam(null, ['openid', 'banking:read'])).toBe('');
  });

  it('omits resource when OIDC scopes and custom API scopes are both requested (multi-resource)', () => {
    const scopes = [
      'openid',
      'profile',
      'email',
      'offline_access',
      'banking:read',
      'banking:write',
      'banking:accounts:read',
      'banking:transactions:read',
      'banking:transactions:write',
    ];
    expect(buildPingOneAuthorizeResourceQueryParam(audience, scopes)).toBe('');
  });

  it('omits resource for ai_agent with openid', () => {
    expect(buildPingOneAuthorizeResourceQueryParam(audience, ['openid', 'ai_agent', 'banking:read'])).toBe('');
  });

  it('still appends resource for API-only scope lists (single resource)', () => {
    const suffix = buildPingOneAuthorizeResourceQueryParam(audience, [
      'banking:read',
      'banking:transactions:read',
    ]);
    expect(suffix).toBe(`&resource=${encodeURIComponent(audience)}`);
  });

  it('appends resource for OIDC-only scope lists', () => {
    const suffix = buildPingOneAuthorizeResourceQueryParam(audience, ['openid', 'profile', 'email']);
    expect(suffix).toBe(`&resource=${encodeURIComponent(audience)}`);
  });
});
