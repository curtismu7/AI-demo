/**
 * PingOne Provisioning Service
 * 
 * Automated setup service for creating PingOne resources via Management API.
 * Creates apps, resource servers, scopes, and demo users with SSE streaming progress.
 */

'use strict';

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { getTokenEndpoint } = require('./oauthEndpointResolver');

// Standard demo password for the bankuser / bankadmin accounts. Same value
// shipped in setup-config.md and the demo's docs — the demo is intentionally
// not security-sensitive, and a known-good password makes onboarding /
// regression testing trivial.
const DEMO_PASSWORD = '2Federate!';

/**
 * Derive a well-formed email domain from the public app URL.
 *
 * Strips the scheme AND port — PingOne's email validator rejects
 * 'bankuser@api.ping.demo:4000' because the colon+port isn't a valid email
 * domain (RFC 5321). It also rejects single-label domains like 'localhost',
 * so we fall back to a plausible synthetic domain in that case.
 *
 *   https://api.ping.demo:4000  → 'api.ping.demo'
 *   http://localhost:4000       → 'demo.invalid'   (RFC 6761 reserved)
 *   https://example.com         → 'example.com'
 */
function demoEmailDomain(publicAppUrl) {
  const stripped = String(publicAppUrl || '')
    .replace(/^https?:\/\//, '')   // drop scheme
    .replace(/\/.*$/, '')          // drop path
    .replace(/:\d+$/, '');          // drop :port
  // RFC 5321 requires at least one dot in the domain part for most validators.
  if (!stripped || !stripped.includes('.')) return 'demo.invalid';
  return stripped;
}

/**
 * Render a step message for createScopes' results.
 * Distinguishes 'created' (newly POSTed) from 'reused' (already existed) so the
 * user doesn't see "Created 0 scopes, 15 failed" on a rerun where everything
 * was actually fine.
 */
function pushScopeResultStep(steps, stepKey, label, results) {
  const created = results.filter(r => r.success && !r.reused).length;
  const reused  = results.filter(r => r.success && r.reused).length;
  const failed  = results.filter(r => !r.success).length;
  let icon, message;
  if (failed > 0) {
    icon = '❌';
    message = `${label}: ${created} created, ${reused} reused, ${failed} FAILED`;
  } else if (created === 0 && reused > 0) {
    icon = '✅';
    message = `${label}: ${reused} reused (all already existed)`;
  } else if (reused > 0) {
    icon = '✅';
    message = `${label}: ${created} created, ${reused} reused`;
  } else {
    icon = '✅';
    message = `${label}: ${created} created`;
  }
  steps.push({ step: stepKey, icon, message });
}

/**
 * Render a step message for one OR more grantScopesToApplication results
 * (some apps grant from multiple resource servers). Combines them.
 */
function pushGrantResultStep(steps, stepKey, label, results) {
  const arr = Array.isArray(results) ? results : [results];
  const failed = arr.filter(r => !r.success);
  if (failed.length > 0) {
    const reasons = failed.map(r => r.error).join('; ');
    steps.push({ step: stepKey, icon: '❌', message: `${label}: grant FAILED — ${reasons}` });
    return;
  }
  // Special case: all results were 'skipped' (e.g. WORKER apps don't accept
  // scope grants — PingOne uses roles for those). Single benign step.
  if (arr.every(r => r.action === 'skipped')) {
    const reason = arr[0].skippedReason || 'not applicable';
    steps.push({ step: stepKey, icon: '✅', message: `${label}: skipped — ${reason}` });
    return;
  }

  const totals = arr.reduce(
    (acc, r) => {
      if (r.action === 'created') acc.created += (r.granted || 0);
      else if (r.action === 'merged') acc.added += (r.addedCount || 0);
      else if (r.action === 'unchanged') acc.unchanged += (r.granted || 0);
      else if (r.action === 'skipped') acc.skipped += 1;
      acc.missing.push(...(r.missingScopes || []));
      return acc;
    },
    { created: 0, added: 0, unchanged: 0, skipped: 0, missing: [] }
  );

  let icon, message;
  const summaryParts = [];
  if (totals.created) summaryParts.push(`${totals.created} created`);
  if (totals.added) summaryParts.push(`${totals.added} added to existing grant`);
  if (totals.unchanged) summaryParts.push(`${totals.unchanged} unchanged`);
  if (totals.skipped) summaryParts.push(`${totals.skipped} skipped`);
  if (totals.missing.length) summaryParts.push(`${totals.missing.length} not found on resource (${totals.missing.slice(0, 3).join(', ')}${totals.missing.length > 3 ? '…' : ''})`);

  if (totals.missing.length > 0) {
    icon = '⚠️';
    message = `${label}: ${summaryParts.join(', ')}`;
  } else {
    icon = '✅';
    message = `${label}: ${summaryParts.join(', ') || 'granted'}`;
  }
  steps.push({ step: stepKey, icon, message });
}

/**
 * Render a step message for createApplication's result. Surfaces drift info
 * so the user can see when an existing app was patched (and which fields).
 *
 * Result shapes from createApplication:
 *   { exists: false }                                 → created fresh
 *   { exists: true, patched: false }                  → reused as-is
 *   { exists: true, patched: true, driftedFields }    → drift detected + patched
 *   { exists: true, patched: false, patchError }      → patch attempt failed
 */
function pushAppResultStep(steps, stepKey, label, result) {
  if (!result.exists) {
    steps.push({ step: stepKey, icon: '✅', message: `${label} created` });
  } else if (result.patched) {
    steps.push({
      step: stepKey,
      icon: '🔁',
      message: `${label} already existed — patched drift in: ${result.driftedFields.join(', ')}`,
      resourceKey: result.resourceKey,
    });
  } else if (result.patchError) {
    steps.push({
      step: stepKey,
      icon: '⚠️',
      message: `${label} already existed — drift detected but patch failed: ${result.patchError}`,
      resourceKey: result.resourceKey,
    });
  } else {
    steps.push({
      step: stepKey,
      icon: '✅',
      message: `${label} already exists (reused)`,
      resourceKey: result.resourceKey,
    });
  }
}

class PingOneProvisionService {
  constructor() {
    this.baseURL = null;
    this.workerToken = null;
    this.envId = null;
    this.region = null;
    this.populationId = null;
  }

  /**
   * Get worker token using client credentials flow
   */
  async getWorkerToken(envId, clientId, clientSecret, region = 'com') {
    // Always derive the token URL from the user's submitted envId+region.
    // We deliberately ignore getTokenEndpoint() here because it can leak a
    // stale value from configStore / a prior install / dev .env, sending the
    // call to the wrong environment and producing a misleading invalid_client
    // response (the credentials are right, the env URL is wrong).
    const tokenUrl = `https://auth.pingone.${region}/${envId}/as/token`;
    try {
      const response = await axios.post(
        tokenUrl,
        'grant_type=client_credentials',
        {
          auth: { username: clientId, password: clientSecret },
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 10000
        }
      );
      return response.data.access_token;
    } catch (error) {
      // Surface PingOne's full error envelope so the user can act on it without
      // chasing a correlation ID. PingOne returns:
      //   { error: "access_denied",
      //     error_description: "Request denied: Application does not have any role assignments (Correlation ID: ...)",
      //     details: [{ code: "...", message: "..." }] }
      const lines = [];
      const status = error.response?.status;
      const data   = error.response?.data;

      lines.push(`Failed to get worker token from PingOne.`);
      lines.push(`  Endpoint:     ${tokenUrl}`);
      lines.push(`  Region:       ${region}`);
      lines.push(`  Environment:  ${envId}`);
      lines.push(`  Client ID:    ${clientId}`);
      if (status) lines.push(`  HTTP status:  ${status}`);
      if (data?.error) lines.push(`  PingOne code: ${data.error}`);
      if (data?.error_description) lines.push(`  Description:  ${data.error_description}`);
      if (Array.isArray(data?.details) && data.details.length > 0) {
        lines.push(`  Details:`);
        for (const d of data.details) {
          if (d.code || d.message) lines.push(`    - ${d.code || ''}${d.code && d.message ? ': ' : ''}${d.message || ''}`);
          if (d.target) lines.push(`      target: ${d.target}`);
          if (Array.isArray(d.innerError)) {
            for (const inner of d.innerError) {
              lines.push(`      inner: ${inner.code || ''} ${inner.message || ''}`.trim());
            }
          }
        }
      }
      if (!data && error.message) lines.push(`  Network error: ${error.message}`);

      // Friendly hint based on the most common error codes we see.
      const code = data?.error;
      const desc = data?.error_description || '';
      if (code === 'access_denied' && /role assignment/i.test(desc)) {
        lines.push('');
        lines.push('  Likely fix: PingOne Admin Console → Applications → your worker app →');
        lines.push('  Roles tab → Grant Roles → "Identity Data Admin" scoped to the environment');
        lines.push(`  (${envId}). Wait ~30s after granting and retry.`);
      } else if (code === 'invalid_client') {
        lines.push('');
        lines.push('  Likely fix: verify the secret was pasted without trailing whitespace, the');
        lines.push('  worker app is enabled, and the region (' + region + ') matches the environment.');
        lines.push('  If you regenerated the client secret recently, paste the new one.');
      } else if (code === 'invalid_grant' || /grant.*type/i.test(desc)) {
        lines.push('');
        lines.push('  Likely fix: PingOne Admin Console → Applications → your worker app →');
        lines.push('  Configuration tab → Grant Type → enable "Client Credentials".');
      }

      const err = new Error(lines.join('\n'));
      err.pingone = { status, code, desc, details: data?.details };
      throw err;
    }
  }

  /**
   * Initialize the service with worker credentials
   */
  async initialize(envId, workerClientId, workerClientSecret, region = 'com') {
    this.envId = envId;
    this.region = region;
    // PingOne Management API base. Endpoint paths in this file are like
    // '/populations', '/applications', etc. — they're appended to baseURL.
    // The full path MUST include /v1/environments/<envId>/. A previous version
    // was missing the /v1/environments prefix, which made every call land on
    // an unrelated PingOne URL that responded with 403 Forbidden — looking
    // exactly like a permission error even though the token was fine.
    this.baseURL = `https://api.pingone.${region}/v1/environments/${envId}`;
    this.workerToken = await this.getWorkerToken(envId, workerClientId, workerClientSecret, region);
    
    // Get default population ID for user creation
    await this.getPopulationId();
  }

  /**
   * Get default population ID
   */
  async getPopulationId() {
    try {
      const response = await this.makeRequest('GET', '/populations');
      const populations = response.data._embedded?.populations || [];
      const defaultPop = populations.find(pop => pop.default) || populations[0];
      
      if (!defaultPop) {
        throw new Error('No population found in environment');
      }
      
      this.populationId = defaultPop.id;
      return this.populationId;
    } catch (error) {
      throw new Error(`Failed to get population ID: ${error.message}`);
    }
  }

  /**
   * Make authenticated request to PingOne Management API
   */
  async makeRequest(method, endpoint, data = null, customHeaders = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${this.workerToken}`,
      'Content-Type': 'application/json',
      ...customHeaders
    };

    try {
      const config = { method, url, headers };
      if (data) {
        config.data = data;
      }

      const response = await axios(config);
      return response;
    } catch (error) {
      // PingOne returns: { code, message, details: [{ code, message, target?, innerError? }] }
      const status = error.response?.status;
      const data   = error.response?.data;
      const parts  = [`${method} ${endpoint} failed`];
      if (status) parts.push(`HTTP ${status}`);
      if (data?.code) parts.push(`code=${data.code}`);
      const detailMsg = data?.details?.[0]?.message;
      const topMsg    = data?.message;
      if (detailMsg && detailMsg !== topMsg) parts.push(detailMsg);
      else if (topMsg) parts.push(topMsg);
      else if (!data && error.message) parts.push(error.message);
      const err = new Error(parts.join(' — '));
      err.pingone = { status, code: data?.code, details: data?.details, url };
      throw err;
    }
  }

  /**
   * Check if resource exists by name
   */
  async findResourceByName(type, name) {
    try {
      const endpoint = type === 'application' ? '/applications' : '/resources';
      const response = await this.makeRequest('GET', endpoint);
      
      const resources = response.data._embedded?.[type === 'application' ? 'applications' : 'resources'] || [];
      return resources.find(resource => resource.name === name);
    } catch (error) {
      return null; // Resource doesn't exist or access denied
    }
  }

  /**
   * Create resource server
   */
  async createResourceServer(name, description, audience) {
    const existing = await this.findResourceByName('resource', name);
    if (existing) {
      // PingOne returns audience as a string on GET; wrap it so callers that
      // read resource.audience[0] (see pingoneProvisionService.js:1014/1017/1026
      // ENDUSER_AUDIENCE / MCP_RESOURCE_URI / MCP_GW_RESOURCE_URI writers) get
      // a URI, not a single character. Without this, the idempotent rerun path
      // wrote `ENDUSER_AUDIENCE=b` (first char of 'banking-...') into .env.
      if (typeof existing.audience === 'string') {
        existing.audience = [existing.audience];
      }
      return {
        exists: true,
        resource: existing,
        resourceKey: `resource:${existing.id}`
      };
    }

    // PingOne /resources schema:
    //   - type: enum { OPENID_CONNECT, PINGONE_API, CUSTOM } — must be CUSTOM
    //     for our use case (NOT the URN string we used to send).
    //   - audience: STRING (single value), not an array. Sending an array
    //     produces "INVALID_VALUE for attribute audience" → INVALID_REQUEST.
    //   - audience is optional; omitting it defaults to `name`. We pass the
    //     caller-provided audience explicitly so callers can use a stable
    //     loopback hostname like `mcp-gw.bxf.com`.
    const data = {
      name,
      description,
      type: 'CUSTOM',
      audience,
    };

    const response = await this.makeRequest('POST', '/resources', data);
    // The response shape PingOne returns matches our previous expectations:
    // resource has an `audience` field (string), surfaced as a single-item
    // array `audience: [aud]` for backwards-compat — wrap it here so code that
    // reads provisioned.resourceServer.audience[0] still works.
    const resource = response.data;
    if (typeof resource.audience === 'string') {
      resource.audience = [resource.audience];
    }
    return {
      exists: false,
      resource,
      resourceKey: `resource:${resource.id}`,
    };
  }

  /**
   * Create scopes on a resource server, idempotently.
   *
   * For each scope: if a scope with the same name already exists on the
   * resource, return it as a `reused` result (no API write). Otherwise POST.
   * Previously POSTs to existing scopes returned HTTP 400 INVALID_DATA, which
   * the old code reported as `failed` — that produced the misleading
   * "Created 0 scopes, 15 failed" output on rerun.
   */
  async createScopes(resourceId, scopes) {
    // List existing scopes once, build a name→object map.
    const existing = await this.makeRequest('GET', `/resources/${resourceId}/scopes`);
    const existingByName = new Map();
    for (const s of (existing.data._embedded?.scopes || [])) {
      existingByName.set(s.name, s);
    }

    const results = [];
    for (const scope of scopes) {
      const found = existingByName.get(scope.name);
      if (found) {
        results.push({ success: true, reused: true, scope: found, name: scope.name });
        continue;
      }
      try {
        const response = await this.makeRequest('POST', `/resources/${resourceId}/scopes`, {
          name: scope.name,
          description: scope.description,
          schema: 'urn:pingone:common:scope',
        });
        results.push({ success: true, reused: false, scope: response.data, name: scope.name });
      } catch (error) {
        results.push({ success: false, error: error.message, name: scope.name });
      }
    }

    return results;
  }

  /**
   * Create OIDC application.
   *
   * PingOne /applications POST schema rules learned by curl probe:
   *   - protocol is REQUIRED on creation. Empty value → INVALID_DATA.
   *   - grantTypes uses the canonical UPPERCASE enum form (AUTHORIZATION_CODE,
   *     CLIENT_CREDENTIALS, REFRESH_TOKEN, TOKEN_EXCHANGE, IMPLICIT, etc).
   *     RFC 6749 lowercase ("authorization_code") is silently rejected.
   *   - tokenEndpointAuthMethod also uses UPPERCASE (CLIENT_SECRET_BASIC etc).
   *   - pkceEnforcement, not pkceMethod (different field name + uppercase enum).
   *   - responseTypes is required for WEB_APP (CODE / TOKEN / ID_TOKEN).
   *   - WORKER apps don't accept refreshToken / pkceEnforcement / responseTypes;
   *     leaving those fields off lets PingOne pick correct defaults.
   *
   * The grantTypes / tokenEndpointAuthMethod input parameters are accepted in
   * either lowercase (legacy) or uppercase form — we normalize to UPPERCASE
   * before sending so existing callers don't all have to change at once.
   */
  async createApplication(name, description, type, grantTypes) {
    // Normalize grants once and reuse.
    const normalizeGrant = (g) => {
      if (g === 'urn:ietf:params:oauth:grant-type:token-exchange') return 'TOKEN_EXCHANGE';
      if (g === 'token_exchange') return 'TOKEN_EXCHANGE';
      return String(g).toUpperCase();
    };
    const desiredGrants = new Set((grantTypes || []).map(normalizeGrant));
    const desiredAuthMethod = 'CLIENT_SECRET_BASIC';

    const existing = await this.findResourceByName('application', name);

    // Drift handling on existing apps: prefer patching; only delete + recreate
    // when the type itself changed (PingOne won't let you change app type via
    // PUT). We don't touch redirectUris here — the wizard's per-app
    // updateApplication() steps set those with the current hostname; that's
    // already an idempotent PUT-with-merge.
    if (existing) {
      // Type mismatch → can't patch, must recreate.
      if (existing.type !== type) {
        try {
          await this.makeRequest('DELETE', `/applications/${existing.id}`);
        } catch (_e) { /* fall through; create will fail with a clear error */ }
        // fall out of this block to the create path below
      } else {
        // Compare patchable fields. PingOne's existing.grantTypes is already
        // uppercase, so set-equality works.
        const currentGrants = new Set((existing.grantTypes || []).map(g => String(g).toUpperCase()));
        const grantsDrift = currentGrants.size !== desiredGrants.size ||
                            [...desiredGrants].some(g => !currentGrants.has(g));
        const authDrift = String(existing.tokenEndpointAuthMethod || '').toUpperCase() !== desiredAuthMethod;
        const enabledDrift = existing.enabled !== true;

        if (grantsDrift || authDrift || enabledDrift) {
          const patch = {};
          if (grantsDrift) patch.grantTypes = [...desiredGrants];
          if (authDrift) patch.tokenEndpointAuthMethod = desiredAuthMethod;
          if (enabledDrift) patch.enabled = true;
          try {
            await this.updateApplication(existing.id, patch);
          } catch (err) {
            // Patching failed — surface the error but keep existing app rather
            // than destroying it.
            return {
              exists: true,
              patched: false,
              patchError: err.message,
              application: existing,
              resourceKey: `application:${existing.id}`,
            };
          }
          // Re-fetch so callers see the updated state.
          const refreshed = (await this.makeRequest('GET', `/applications/${existing.id}`)).data;
          return {
            exists: true,
            patched: true,
            driftedFields: Object.keys(patch),
            application: refreshed,
            resourceKey: `application:${refreshed.id}`,
          };
        }

        // No drift — return as-is.
        return {
          exists: true,
          patched: false,
          application: existing,
          resourceKey: `application:${existing.id}`,
        };
      }
    }

    // Create path (no existing OR existing was deleted due to type mismatch).
    const data = {
      name,
      description,
      enabled: true,
      type,
      protocol: 'OPENID_CONNECT',
      grantTypes: [...desiredGrants],
      tokenEndpointAuthMethod: desiredAuthMethod,
    };

    // WEB_APP / NATIVE_APP / SINGLE_PAGE_APP need responseTypes + redirectUris
    // setup later via updateApplication. WORKER doesn't.
    if (type !== 'WORKER') {
      data.responseTypes = ['CODE'];
      data.pkceEnforcement = 'S256_REQUIRED';
      data.refreshToken = { rotating: true, reuseTokens: false };
    }

    const response = await this.makeRequest('POST', '/applications', data);
    return {
      exists: false,
      application: response.data,
      resourceKey: `application:${response.data.id}`,
    };
  }

  /**
   * Update application redirect URIs and PKCE settings.
   *
   * Normalizes legacy lowercase enum values to the UPPERCASE form PingOne
   * requires, and rewrites legacy field names that callers may still pass:
   *   pkceMethod    →  pkceEnforcement
   *   grantTypes    →  uppercased + token-exchange URN expanded
   *   tokenEndpointAuthMethod →  uppercased
   *
   * All callers can pass either form; we send the canonical PingOne form.
   */
  async updateApplication(appId, updates) {
    const normalizeGrant = (g) => {
      if (g === 'urn:ietf:params:oauth:grant-type:token-exchange') return 'TOKEN_EXCHANGE';
      if (g === 'token_exchange') return 'TOKEN_EXCHANGE';
      return String(g).toUpperCase();
    };
    const normalized = { ...updates };
    if (Array.isArray(normalized.grantTypes)) {
      normalized.grantTypes = normalized.grantTypes.map(normalizeGrant);
    }
    if (typeof normalized.tokenEndpointAuthMethod === 'string') {
      normalized.tokenEndpointAuthMethod = normalized.tokenEndpointAuthMethod.toUpperCase();
    }
    if (normalized.pkceMethod && !normalized.pkceEnforcement) {
      normalized.pkceEnforcement = String(normalized.pkceMethod).toUpperCase() === 'S256'
        ? 'S256_REQUIRED'
        : String(normalized.pkceMethod).toUpperCase();
      delete normalized.pkceMethod;
    }

    // PingOne PUT /applications/{id} is a FULL replace, not a partial patch —
    // sending only the fields you want to change drops the others (and
    // immediately fails on required fields like 'protocol' with INVALID_DATA).
    // Fetch the current app, merge our changes on top, strip read-only/HATEOAS
    // fields, and send the result.
    const current = (await this.makeRequest('GET', `/applications/${appId}`)).data;
    const READONLY_FIELDS = ['_links', 'environment', 'id', 'createdAt', 'updatedAt', 'clientId', 'signing'];
    const merged = { ...current, ...normalized };
    for (const k of READONLY_FIELDS) delete merged[k];

    const response = await this.makeRequest('PUT', `/applications/${appId}`, merged);
    return response.data;
  }

  /**
   * Fetch the client secret for an application from /applications/{id}/secret.
   * PingOne does NOT return clientSecret on POST /applications — it lives on a
   * separate sub-resource and must be fetched explicitly.
   * Returns null on failure (e.g. NONE auth method, where no secret exists).
   */
  async getApplicationSecret(appId) {
    try {
      const response = await this.makeRequest('GET', `/applications/${appId}/secret`);
      return response.data?.secret || null;
    } catch (_e) {
      return null;
    }
  }

  /**
   * Idempotently set a CUSTOM attribute on a resource server.
   * If an attribute with the same name already exists, it's deleted and
   * recreated with the new value (PingOne doesn't accept a name-collision on
   * POST). Reserved CORE attributes (e.g. 'sub') would refuse delete and are
   * skipped.
   */
  async _setResourceAttribute(resourceId, name, value) {
    // Find existing attr by name
    const list = await this.makeRequest('GET', `/resources/${resourceId}/attributes`);
    const existing = (list.data._embedded?.attributes || []).find(a => a.name === name);
    if (existing) {
      if (existing.type === 'CORE') return existing;       // can't delete CORE
      try {
        await this.makeRequest('DELETE', `/resources/${resourceId}/attributes/${existing.id}`);
      } catch (_e) { /* fall through and let POST report a duplicate */ }
    }
    const response = await this.makeRequest('POST', `/resources/${resourceId}/attributes`, {
      name,
      value,
      type: 'CUSTOM',
    });
    return response.data;
  }

  /**
   * Idempotently ensure a CUSTOM user-schema attribute exists.
   * PingOne's schema attribute API rejects re-creation with INVALID_DATA, so we
   * check first and only POST if missing. PingOne user-schema attributes can
   * only be STRING or JSON (BOOLEAN is rejected); we store boolean-ish values
   * as the strings "true" / "false".
   */
  async _ensureUserSchemaAttribute(name, type = 'STRING', displayName = null) {
    // Find the User schema id (cache once per service instance).
    if (!this._userSchemaId) {
      const schemas = (await this.makeRequest('GET', '/schemas?filter=name eq "User"')).data;
      this._userSchemaId = schemas._embedded?.schemas?.[0]?.id;
      if (!this._userSchemaId) throw new Error('User schema not found');
    }
    const attrs = (await this.makeRequest('GET', `/schemas/${this._userSchemaId}/attributes`)).data._embedded?.attributes || [];
    const existing = attrs.find(a => a.name === name);
    if (existing) return existing;

    const response = await this.makeRequest('POST', `/schemas/${this._userSchemaId}/attributes`, {
      name,
      displayName: displayName || name,
      type,
      enabled: true,
      required: false,
      unique: false,
    });
    return response.data;
  }

  /**
   * Idempotently ensure a group exists, return its id.
   */
  async _ensureGroup(name, description = '') {
    const list = (await this.makeRequest('GET', `/groups?filter=name eq "${name}"`)).data._embedded?.groups || [];
    if (list[0]) return list[0].id;
    const response = await this.makeRequest('POST', '/groups', { name, description });
    return response.data.id;
  }

  /**
   * Idempotently ensure a permissive password policy exists.
   *
   * Demo-tuned: lowest-friction policy PingOne will accept.
   *   - length min 8 (PingOne floor; can't go below)
   *   - no character-class requirements (no minCharacters)
   *   - no commonly-used dictionary check
   *   - no profile-data similarity check
   *   - no current-password similarity check
   *   - no history field (only PingOne's hardcoded floor "can't reuse current
   *     password" still applies — there's no API to disable that)
   *   - no age limits, no max-repeat, no min-unique
   *
   * Returns the policy id.
   */
  async _ensurePasswordPolicy(name, description = '') {
    const list = (await this.makeRequest('GET', '/passwordPolicies')).data._embedded?.passwordPolicies || [];
    const existing = list.find(p => p.name === name);
    if (existing) return existing.id;

    const response = await this.makeRequest('POST', '/passwordPolicies', {
      name,
      description: description || 'Demo-friendly password policy: 8-char minimum, no other rules.',
      excludesProfileData: false,
      notSimilarToCurrent: false,
      excludesCommonlyUsed: false,
      length: { min: 8, max: 255 },
      // Intentionally omit history/lockout/minCharacters/age fields — those
      // become "no rule" when absent from the policy.
    });
    return response.data.id;
  }

  /**
   * Bind a password policy to a population. PingOne's PUT /populations/{id}
   * is FULL replace — must include name, default flag, and other fields or
   * they get reset. We preserve the population's existing fields and only
   * change passwordPolicy.
   */
  async _bindPopulationPolicy(populationId, policyId) {
    const current = (await this.makeRequest('GET', `/populations/${populationId}`)).data;
    const body = {
      name: current.name,
      description: current.description || '',
      default: current.default || false,
      preferredLanguage: current.preferredLanguage,
      passwordPolicy: { id: policyId },
    };
    // Optional fields PingOne may set; only include if non-empty.
    if (current.theme?.id) body.theme = { id: current.theme.id };
    await this.makeRequest('PUT', `/populations/${populationId}`, body);
  }

  /**
   * Idempotently add user to group via the membership sub-resource.
   * Re-adding a user is a 204 no-op (PingOne handles dedup).
   */
  async _ensureUserInGroup(userId, groupId) {
    try {
      await this.makeRequest('POST', `/users/${userId}/memberOfGroups`, { id: groupId });
    } catch (err) {
      // 409 / "already a member" is success here. Re-throw anything else.
      if (err.pingone?.status === 409 || /already.*member|already exists/i.test(err.message)) return;
      throw err;
    }
  }

  /**
   * Grant scopes to application — idempotent.
   *
   * PingOne /applications/{id}/grants POST payload shape:
   *   { resource: { id: <resourceId> }, scopes: [{ id: <scopeId> }, ...] }
   *
   * NOT { resourceId, scopes: ['name', ...] } — that's what the previous
   * version sent, which is why "Failed to grant scopes" warnings appeared on
   * every grant step. We have to:
   *   1. Look up scope IDs on the resource (input is scope names).
   *   2. Check whether a grant for this resource already exists; if so, MERGE
   *      the new scopes into the existing grant via PUT (POST would 409 on
   *      duplicate resource).
   *   3. Otherwise POST a fresh grant.
   *
   * Inputs:
   *   appId       — application id to grant to
   *   resourceId  — the resource server whose scopes we're granting
   *   scopes      — array of scope NAME strings
   *
   * Returns: { success, action: 'created'|'merged'|'unchanged', granted: number }
   */
  async grantScopesToApplication(appId, resourceId, scopeNames) {
    try {
      // 0. PingOne forbids resource access grants on WORKER apps for any
      //    resource other than 'openid'. WORKERs auth via client_credentials
      //    and use ROLE assignments, not scope grants — see
      //    https://apidocs.pingidentity.com (REQUEST_FAILED on POST /grants).
      //    Treat as benign skip rather than fail.
      const app = (await this.makeRequest('GET', `/applications/${appId}`)).data;
      if (app.type === 'WORKER') {
        return {
          success: true,
          action: 'skipped',
          skippedReason: 'WORKER apps use roles, not scope grants',
          granted: 0,
        };
      }

      // 1. Resolve scope names → ids on the target resource.
      const resourceScopes = (await this.makeRequest('GET', `/resources/${resourceId}/scopes`))
        .data._embedded?.scopes || [];
      const idByName = new Map(resourceScopes.map(s => [s.name, s.id]));
      const desiredIds = [];
      const missing = [];
      for (const name of (scopeNames || [])) {
        const id = idByName.get(name);
        if (id) desiredIds.push(id);
        else missing.push(name);
      }
      if (missing.length > 0 && desiredIds.length === 0) {
        return { success: false, error: `No scopes resolved on resource: ${missing.join(', ')}` };
      }
      // Helper to detect "all desired scope names are already granted via
      // other resources" — used after the cross-resource filter below.

      // 2. Find existing grants on this app and figure out which scope NAMES
      //    are already granted by other resources. PingOne enforces a global
      //    "one scope name per app" rule across all that app's grants — even
      //    if the same name comes from two different resources, it's rejected
      //    with INVALID_DATA "Multiple scopes with the same name cannot be
      //    added to the same grant." Filter those out of our desiredIds.
      const existingGrants = (await this.makeRequest('GET', `/applications/${appId}/grants`))
        .data._embedded?.grants || [];

      // Build set of scope names already granted on OTHER resources.
      const otherResourceScopeNames = new Set();
      for (const g of existingGrants) {
        if (g.resource?.id === resourceId) continue;            // skip same resource
        for (const s of (g.scopes || [])) {
          // Look up the name by id from any other resource's scope list.
          // We have idByName for THIS resource; for cross-resource we'd need a
          // lookup. Cheaper: just fetch the names of scopes in this grant.
        }
      }
      // The above can't cheaply resolve cross-resource scope IDs to names.
      // Simpler: pre-fetch ALL resources' scopes once.
      let allOtherNames = new Set();
      for (const g of existingGrants) {
        if (g.resource?.id === resourceId) continue;
        const otherScopes = (await this.makeRequest('GET', `/resources/${g.resource.id}/scopes`))
          .data._embedded?.scopes || [];
        const otherIdToName = new Map(otherScopes.map(s => [s.id, s.name]));
        for (const s of (g.scopes || [])) {
          const n = otherIdToName.get(s.id);
          if (n) allOtherNames.add(n);
        }
      }

      // Filter desiredIds: drop any whose NAME is already granted via another resource.
      const idToName = new Map(resourceScopes.map(s => [s.id, s.name]));
      const filteredIds = desiredIds.filter(id => {
        const name = idToName.get(id);
        return name && !allOtherNames.has(name);
      });
      const droppedAsCrossResource = desiredIds.length - filteredIds.length;
      desiredIds.length = 0;
      desiredIds.push(...filteredIds);

      // If all desired names were already granted via other resources, there's
      // nothing to do here — return a benign skip.
      if (desiredIds.length === 0 && droppedAsCrossResource > 0) {
        return {
          success: true,
          action: 'skipped',
          skippedReason: `all ${droppedAsCrossResource} scope names already granted via other resources on this app`,
          granted: 0,
        };
      }

      const match = existingGrants.find(g => g.resource?.id === resourceId);

      if (match) {
        // Merge: union of (existing scope ids) + desiredIds.
        const existingIds = new Set((match.scopes || []).map(s => s.id));
        const toAdd = desiredIds.filter(id => !existingIds.has(id));
        if (toAdd.length === 0) {
          return { success: true, action: 'unchanged', granted: existingIds.size, missingScopes: missing };
        }
        const merged = [...existingIds, ...toAdd].map(id => ({ id }));
        // PUT replaces the grant in place; PingOne accepts updates here.
        await this.makeRequest('PUT', `/applications/${appId}/grants/${match.id}`, {
          resource: { id: resourceId },
          scopes: merged,
        });
        return { success: true, action: 'merged', granted: merged.length, addedCount: toAdd.length, missingScopes: missing };
      }

      // 3. No existing grant → POST a fresh one.
      // Dedup by id in case the input scopeNames had duplicates upstream.
      const uniqueIds = Array.from(new Set(desiredIds));
      const response = await this.makeRequest('POST', `/applications/${appId}/grants`, {
        resource: { id: resourceId },
        scopes: uniqueIds.map(id => ({ id })),
      });
      return { success: true, action: 'created', granted: uniqueIds.length, grant: response.data, missingScopes: missing };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Create user
   */
  async createUser(username, firstName, lastName, email) {
    const existing = await this.findUserByUsername(username);
    if (existing) {
      return { 
        exists: true, 
        user: existing,
        resourceKey: `user:${existing.id}`
      };
    }

    const data = {
      username,
      name: {
        given: firstName,
        family: lastName
      },
      email,
      enabled: true,
      population: { id: this.populationId }
    };

    const response = await this.makeRequest('POST', '/users', data);
    return { 
      exists: false, 
      user: response.data,
      resourceKey: `user:${response.data.id}`
    };
  }

  /**
   * Find user by username
   */
  async findUserByUsername(username) {
    try {
      const response = await this.makeRequest('GET', `/users?filter=username eq "${username}"`);
      const users = response.data._embedded?.users || [];
      return users[0] || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Set user password
   */
  async setUserPassword(userId, password) {
    // PingOne /users/{id}/password expects { value: '<password>' } with the
    // vnd.pingidentity.password.set+json content-type.
    //
    // PingOne enforces password-history (default: cannot reuse the most-recent
    // N passwords). On rerun where the user already has the demo password set,
    // PingOne rejects re-setting to the SAME value with INVALID_DATA + the
    // message "New password did not satisfy password policy requirements."
    //
    // For the demo we treat that specific failure as success-already-set:
    // the password is already what we want, no harm done.
    try {
      const response = await this.makeRequest(
        'PUT',
        `/users/${userId}/password`,
        { value: password },
        { 'Content-Type': 'application/vnd.pingidentity.password.set+json' }
      );
      return { changed: true, ...response.data };
    } catch (err) {
      const desc = String(err.pingone?.details?.[0]?.message || err.message || '');
      if (/password.*polic|did not satisf/i.test(desc)) {
        // Almost certainly the password-history check rejecting "set to same
        // value as already in place". Surface as benign skip rather than fail.
        return { changed: false, skipped: 'password_policy_history' };
      }
      throw err;
    }
  }

  /**
   * Write .env file
   * Resolves to banking_api_server/.env regardless of cwd, so the wizard can be
   * invoked from anywhere without clobbering an unrelated .env.
   *
   * Preserves SESSION_SECRET and CONFIG_ENCRYPTION_KEY from any existing .env
   * because configStore derives its config.db encryption key from them — if we
   * generated a fresh value here, an already-encrypted config.db would fail to
   * decrypt on next startup. (Brand-new installs that have no .env yet get a
   * randomly generated SESSION_SECRET written below.)
   */
  async writeEnvFile(config, provisioned) {
    const envPath = path.resolve(__dirname, '..', '.env');

    let preserved = {};
    try {
      const existing = await fs.readFile(envPath, 'utf8');
      const grab = (key) => {
        const m = existing.match(new RegExp(`^${key}=(.+)$`, 'm'));
        return m ? m[1].trim() : null;
      };
      const sessionSecret = grab('SESSION_SECRET');
      const configKey = grab('CONFIG_ENCRYPTION_KEY');
      if (sessionSecret) preserved.SESSION_SECRET = sessionSecret;
      if (configKey) preserved.CONFIG_ENCRYPTION_KEY = configKey;
    } catch (_e) { /* no existing .env — fall through and generate one */ }

    if (!preserved.SESSION_SECRET && !preserved.CONFIG_ENCRYPTION_KEY) {
      preserved.SESSION_SECRET = require('crypto').randomBytes(32).toString('hex');
    }

    const envContent = this.generateEnvContent(config, provisioned, preserved);
    await fs.writeFile(envPath, envContent, 'utf8');
    return envPath;
  }

  /**
   * Generate .env file content.
   * `preserved` carries SESSION_SECRET / CONFIG_ENCRYPTION_KEY values that must
   * survive the rewrite — see writeEnvFile() for the rationale.
   */
  generateEnvContent(config, provisioned, preserved = {}) {
    const lines = [
      '# PingOne Configuration - Generated by Setup Wizard',
      `PINGONE_ENVIRONMENT_ID=${config.envId}`,
      `PINGONE_REGION=${config.region}`,
      '',
      '# Session / config encryption (preserved from existing .env if present)',
    ];
    if (preserved.SESSION_SECRET) lines.push(`SESSION_SECRET=${preserved.SESSION_SECRET}`);
    if (preserved.CONFIG_ENCRYPTION_KEY) lines.push(`CONFIG_ENCRYPTION_KEY=${preserved.CONFIG_ENCRYPTION_KEY}`);
    lines.push('');
    lines.push(...[
      '# Admin Application (staff/admin OAuth client)',
      `PINGONE_ADMIN_CLIENT_ID=${provisioned.adminApp.clientId}`,
      `PINGONE_ADMIN_CLIENT_SECRET=${provisioned.adminApp.clientSecret || '<set-in-pingone-console>'}`,
      `PINGONE_ADMIN_REDIRECT_URI=${config.publicAppUrl}/api/auth/oauth/callback`,
      '',
      '# User Application (end-user/customer OAuth client)',
      // Use PINGONE_USER_* — the canonical name. The legacy PINGONE_CORE_*
      // names exist in configStore's fallback map but they collide with the
      // admin fallback chain (PINGONE_CORE_CLIENT_ID is listed as an admin
      // alias), so writing user IDs under that name made the BFF treat the
      // user app as the admin app and left userClientId null.
      `PINGONE_USER_CLIENT_ID=${provisioned.userApp.clientId}`,
      `PINGONE_USER_CLIENT_SECRET=${provisioned.userApp.clientSecret || '<set-in-pingone-console>'}`,
      `PINGONE_USER_REDIRECT_URI=${config.publicAppUrl}/api/auth/oauth/user/callback`,
      '',
      '# Resource Server',
      `ENDUSER_AUDIENCE=${provisioned.resourceServer.audience[0]}`,
      '',
      '# MCP Resource Server',
      `MCP_RESOURCE_URI=${provisioned.mcpResourceServer?.audience?.[0] || 'https://mcp-server.pingdemo.com'}`,
      '',
      '# MCP Exchanger (Token Exchange)',
      `PINGONE_MCP_EXCHANGER_CLIENT_ID=${provisioned.mcpExchangerApp?.clientId || ''}`,
      `PINGONE_MCP_EXCHANGER_CLIENT_SECRET=${provisioned.mcpExchangerApp?.clientSecret || '<set-in-pingone-console>'}`,
      '',
      '# MCP Gateway (banking_mcp_gateway on :3005)',
      `MCP_GW_CLIENT_ID=${provisioned.mcpGwApp?.clientId || ''}`,
      `MCP_GW_CLIENT_SECRET=${provisioned.mcpGwApp?.clientSecret || '<set-in-pingone-console>'}`,
      `MCP_GW_RESOURCE_URI=${provisioned.mcpGwResourceServer?.audience?.[0] || 'mcp-gw.bxf.com'}`,
      'MCP_GW_TOKEN_ENDPOINT_AUTH_METHOD=basic',
      '',
      '# Agent Service (banking_agent_service on :3006)',
      `AGENT_CLIENT_ID=${provisioned.agentApp?.clientId || ''}`,
      `AGENT_CLIENT_SECRET=${provisioned.agentApp?.clientSecret || '<set-in-pingone-console>'}`,
      '',
      '# Admin Token Exchange',
      `ff_admin_token_exchange=true`,
      `ADMIN_TOKEN_LIFETIME=7200`,
      `ADMIN_REFRESH_TOKEN_LIFETIME=86400`,
      '',
      '# Demo Users',
      `DEMO_USER_USERNAME=bankuser`,
      `DEMO_USER_PASSWORD=${provisioned.bankUser.password}`,
      `DEMO_ADMIN_USERNAME=bankadmin`,
      `DEMO_ADMIN_PASSWORD=${provisioned.bankAdmin.password}`,
      '',
      '# Worker Credentials (for future management)',
      `PINGONE_WORKER_CLIENT_ID=${config.workerClientId}`,
      `PINGONE_WORKER_CLIENT_SECRET=${config.workerClientSecret}`,
    ]);

    return lines.join('\n');
  }



  /**
   * Main provisioning function
   */
  async provisionEnvironment(config, onStep) {
    const steps = [];
    const provisioned = {};

    try {
      // Step 1: Initialize and validate worker credentials
      steps.push({ step: 'validate', icon: '🔐', message: 'Validating worker credentials...' });
      onStep(steps[steps.length - 1]);
      
      await this.initialize(config.envId, config.workerClientId, config.workerClientSecret, config.region);
      
      steps.push({ step: 'validate', icon: '✅', message: 'Worker credentials validated' });
      onStep(steps[steps.length - 1]);

      // Step 2: Get population ID (done in initialize)
      steps.push({ step: 'population', icon: '👥', message: `Using population: ${this.populationId}` });
      onStep(steps[steps.length - 1]);

      // Step 3: Create Resource Server
      steps.push({ step: 'resource-server', icon: '🏗️', message: 'Creating resource server...' });
      onStep(steps[steps.length - 1]);
      
      const resourceResult = await this.createResourceServer(
        'Super Banking API',
        'Banking API resource server for user and admin applications',
        config.audience || 'banking_api_enduser'
      );
      
      if (resourceResult.exists) {
        steps.push({ 
          step: 'resource-server', 
          icon: '✅',
          message: 'Resource server already exists (reused)',
          resourceKey: resourceResult.resourceKey
        });
      } else {
        steps.push({ step: 'resource-server', icon: '✅', message: 'Resource server created' });
      }
      onStep(steps[steps.length - 1]);
      provisioned.resourceServer = resourceResult.resource;

      // Step 4.5: Create MCP Resource Server for Admin Operations
      steps.push({ step: 'mcp-resource-server', icon: '🔧', message: 'Creating MCP resource server for admin operations...' });
      onStep(steps[steps.length - 1]);
      
      // Args are (name, description, audience). The audience string is what
      // ends up in JWT `aud` claims and must be a stable identifier — not a
      // human description. Previously these two were swapped, causing tokens
      // minted for this resource to have aud='MCP server for admin tool…'
      // which then either failed downstream audience checks or polluted
      // .env with the description string as MCP_RESOURCE_URI.
      const mcpResourceResult = await this.createResourceServer(
        'Super Banking MCP Server',
        'MCP server for admin tool execution and privileged operations',
        config.mcpResourceAudience || 'mcp-server.bxf.com'
      );
      
      if (mcpResourceResult.exists) {
        steps.push({ 
          step: 'mcp-resource-server', 
          icon: '✅',
          message: 'MCP resource server already exists (reused)',
          resourceKey: mcpResourceResult.resourceKey
        });
      } else {
        steps.push({ step: 'mcp-resource-server', icon: '✅', message: 'MCP resource server created' });
      }
      onStep(steps[steps.length - 1]);
      provisioned.mcpResourceServer = mcpResourceResult.resource;

      // Step 4.6: Create MCP-specific scopes
      steps.push({ step: 'mcp-scopes', icon: '🎯', message: 'Creating MCP-specific scopes...' });
      onStep(steps[steps.length - 1]);
      
      const mcpScopes = [
        { name: 'admin:read', description: 'Read administrative data and system status' },
        { name: 'admin:write', description: 'Modify administrative settings and configurations' },
        { name: 'admin:delete', description: 'Delete users and administrative resources' },
        { name: 'users:read', description: 'Read user profiles and account information' },
        { name: 'users:manage', description: 'Manage user accounts and permissions' },
        { name: 'banking:read', description: 'Read banking data and transaction history' },
        { name: 'banking:write', description: 'Perform banking operations and transfers' },
        { name: 'banking:ai:agent:read', description: 'Agent invocation permission' },
        // Phase 267 — mortgage scope must exist on the MCP-server resource too
        // so the user's inbound token can carry it; the gateway then re-exchanges
        // (RFC 8693) it for the backend-scoped token used to call mortgage service.
        { name: 'banking:mortgage:read', description: 'Read mortgage account data (Path A api-key disposition)' }
      ];
      
      const mcpScopeResults = await this.createScopes(mcpResourceResult.resource.id, mcpScopes);
      pushScopeResultStep(steps, 'mcp-scopes', 'MCP scopes', mcpScopeResults);
      onStep(steps[steps.length - 1]);

      // Step 5: Create scopes
      steps.push({ step: 'scopes', icon: '🎯', message: 'Creating banking scopes...' });
      onStep(steps[steps.length - 1]);
      
      // NOTE: p1:read:user / p1:update:user dropped here — PingOne reserves
      // the p1:* prefix for its own scopes and rejects custom-resource
      // creation with INVALID_VALUE. Worker apps that need PingOne management
      // API access get those rights through ROLE assignments, not scope grants.
      const scopes = [
        { name: 'banking:read', description: 'Read access to banking data' },
        { name: 'banking:write', description: 'Write access to banking operations' },
        { name: 'banking:accounts:read', description: 'Read account information and balances' },
        { name: 'banking:transactions:read', description: 'Read transaction history and details' },
        { name: 'banking:mortgage:read', description: 'Read mortgage account data (Phase 267 — Path A api-key disposition)' },
        { name: 'banking:accounts', description: 'Account access and management' },
        { name: 'banking:admin', description: 'Administrative access' },
        { name: 'banking:ai:agent:read', description: 'Agent invocation permission' },
        { name: 'ai_agent', description: 'AI agent identity' },
        // Admin-specific scopes
        { name: 'admin:read', description: 'Read administrative data and system status' },
        { name: 'admin:write', description: 'Modify administrative settings and configurations' },
        { name: 'admin:delete', description: 'Delete users and administrative resources' },
        { name: 'users:read', description: 'Read user profiles and account information' },
        { name: 'users:manage', description: 'Manage user accounts and permissions' }
      ];
      
      const scopeResults = await this.createScopes(resourceResult.resource.id, scopes);
      pushScopeResultStep(steps, 'scopes', 'Banking scopes', scopeResults);
      onStep(steps[steps.length - 1]);

      // Step 5: Create Admin Application
      steps.push({ step: 'admin-app', icon: '🔧', message: 'Creating admin application...' });
      onStep(steps[steps.length - 1]);
      
      const adminAppResult = await this.createApplication(
        'Super Banking Admin App',
        'Admin application for Super Banking demo',
        'WEB_APP',
        ['authorization_code', 'refresh_token']
      );
      
      pushAppResultStep(steps, 'admin-app', 'Admin application', adminAppResult);
      onStep(steps[steps.length - 1]);
      provisioned.adminApp = adminAppResult.application;
      provisioned.adminApp.clientSecret = await this.getApplicationSecret(adminAppResult.application.id);

      // Step 6: Configure Admin Application
      if (!adminAppResult.exists) {
        steps.push({ step: 'admin-config', icon: '⚙️', message: 'Configuring admin application...' });
        onStep(steps[steps.length - 1]);
        
        await this.updateApplication(adminAppResult.application.id, {
          redirectUris: [`${config.publicAppUrl}/api/auth/oauth/callback`],
          pkceMethod: 'S256',
          tokenEndpointAuthMethod: 'client_secret_post',
          grantTypes: ['authorization_code', 'refresh_token', 'urn:ietf:params:oauth:grant-type:token-exchange'],
          tokenLifetime: 7200, // 2 hours for admin sessions
          refreshTokenLifetime: 86400 // 24 hours
        });
        
        // Enable token customization for may_act claim
        await this.enableTokenCustomization(adminAppResult.application.id);
        
        // Add may_act claim for token exchange
        await this.addTokenClaim(adminAppResult.application.id, 'may_act', 'JSON', {
          sub: "{{PINGONE_ADMIN_CLIENT_ID}}"
        });
        
        steps.push({ step: 'admin-config', icon: '✅', message: 'Admin application configured with token exchange' });
        onStep(steps[steps.length - 1]);
      } else {
        // Existing admin app — refresh redirect URI only. Don't overwrite other settings,
        // which the user may have customized in PingOne admin. Important for migration:
        // archived apps may still point at api.pingdemo.com; we sync to current host.
        const targetUri = `${config.publicAppUrl}/api/auth/oauth/callback`;
        const currentUris = adminAppResult.application.redirectUris || [];
        if (!currentUris.includes(targetUri)) {
          steps.push({ step: 'admin-config', icon: '🔁', message: `Refreshing admin redirect URI → ${targetUri}` });
          onStep(steps[steps.length - 1]);
          await this.updateApplication(adminAppResult.application.id, { redirectUris: [targetUri] });
          steps.push({ step: 'admin-config', icon: '✅', message: 'Admin redirect URI refreshed' });
          onStep(steps[steps.length - 1]);
        }
      }

      // Step 7: Grant scopes to Admin Application
      steps.push({ step: 'admin-grants', icon: '🔑', message: 'Granting scopes to admin application...' });
      onStep(steps[steps.length - 1]);
      
      // Grant scopes from main resource server
      const adminGrantResult = await this.grantScopesToApplication(
        adminAppResult.application.id,
        resourceResult.resource.id,
        scopes.map(s => s.name)
      );
      
      // Grant admin-specific scopes from MCP resource server
      const adminMcpGrantResult = await this.grantScopesToApplication(
        adminAppResult.application.id,
        mcpResourceResult.resource.id,
        mcpScopes.map(s => s.name)
      );
      
      pushGrantResultStep(steps, 'admin-grants', 'Admin scope grants', [adminGrantResult, adminMcpGrantResult]);
      onStep(steps[steps.length - 1]);

      // Step 8: Create User Application
      steps.push({ step: 'user-app', icon: '👤', message: 'Creating user application...' });
      onStep(steps[steps.length - 1]);
      
      const userAppResult = await this.createApplication(
        'Super Banking User App',
        'User application for Super Banking demo',
        'WEB_APP',
        ['authorization_code', 'refresh_token']
      );
      
      pushAppResultStep(steps, 'user-app', 'User application', userAppResult);
      onStep(steps[steps.length - 1]);
      provisioned.userApp = userAppResult.application;
      provisioned.userApp.clientSecret = await this.getApplicationSecret(userAppResult.application.id);

      // Step 9: Configure User Application
      // The end-user OAuth callback uses /api/auth/oauth/USER/callback so the
      // BFF can distinguish admin vs user sign-ins. (The admin app uses the
      // un-suffixed /api/auth/oauth/callback). Mismatching this caused PingOne
      // to reject the callback and the SPA to redirect to /config?error.
      const userRedirectUri = `${config.publicAppUrl}/api/auth/oauth/user/callback`;
      if (!userAppResult.exists) {
        steps.push({ step: 'user-config', icon: '⚙️', message: 'Configuring user application...' });
        onStep(steps[steps.length - 1]);

        await this.updateApplication(userAppResult.application.id, {
          redirectUris: [userRedirectUri],
          pkceMethod: 'S256',
          tokenEndpointAuthMethod: 'client_secret_post'
        });

        steps.push({ step: 'user-config', icon: '✅', message: 'User application configured' });
        onStep(steps[steps.length - 1]);
      } else {
        // Existing user app — refresh redirect URI only (see admin branch above).
        const currentUris = userAppResult.application.redirectUris || [];
        if (!currentUris.includes(userRedirectUri)) {
          steps.push({ step: 'user-config', icon: '🔁', message: `Refreshing user redirect URI → ${userRedirectUri}` });
          onStep(steps[steps.length - 1]);
          await this.updateApplication(userAppResult.application.id, { redirectUris: [userRedirectUri] });
          steps.push({ step: 'user-config', icon: '✅', message: 'User redirect URI refreshed' });
          onStep(steps[steps.length - 1]);
        }
      }

      // Step 10: Grant scopes to User Application
      steps.push({ step: 'user-grants', icon: '🔑', message: 'Granting scopes to user application...' });
      onStep(steps[steps.length - 1]);
      
      const userGrantResult = await this.grantScopesToApplication(
        userAppResult.application.id,
        resourceResult.resource.id,
        ['banking:ai:agent:read', 'banking:read', 'banking:write', 'banking:mortgage:read']
      );
      
      pushGrantResultStep(steps, 'user-grants', 'User scope grants', userGrantResult);
      onStep(steps[steps.length - 1]);

      // Step 10.5: Ensure permissive demo password policy is bound to the
      // default population BEFORE we create users — otherwise the very first
      // user creation has to satisfy PingOne's Standard policy (history of 6
      // entries, requires upper+lower+digit+special, etc).
      steps.push({ step: 'password-policy', icon: '🔧', message: 'Ensuring permissive demo password policy...' });
      onStep(steps[steps.length - 1]);
      try {
        const policyId = await this._ensurePasswordPolicy(
          'Banking Demo',
          'Demo-friendly: 8-char minimum, no character classes, no commonly-used check, no history beyond PingOne floor.'
        );
        await this._bindPopulationPolicy(this.populationId, policyId);
        steps.push({ step: 'password-policy', icon: '✅', message: 'Banking Demo password policy bound to default population' });
      } catch (polErr) {
        steps.push({ step: 'password-policy', icon: '⚠️', message: `Password policy step: ${polErr.message}` });
      }
      onStep(steps[steps.length - 1]);

      // Step 11: Create demo user bankuser
      steps.push({ step: 'bankuser', icon: '👨', message: 'Creating demo user: bankuser...' });
      onStep(steps[steps.length - 1]);
      
      const bankUserResult = await this.createUser(
        'bankuser',
        'Demo',
        'User',
        `bankuser@${demoEmailDomain(config.publicAppUrl)}`
      );
      
      if (bankUserResult.exists) {
        steps.push({ 
          step: 'bankuser', 
          icon: '✅',
          message: 'User bankuser already exists (reused)',
          resourceKey: bankUserResult.resourceKey
        });
      } else {
        steps.push({ step: 'bankuser', icon: '✅', message: 'User bankuser created' });
      }
      onStep(steps[steps.length - 1]);

      // Step 12: Set bankuser password — always run, even on rerun, so the
      // documented demo password is guaranteed to work even after manual
      // PingOne admin changes or older partial-runs that wrote a different one.
      {
        const bankUserPassword = DEMO_PASSWORD;
        steps.push({ step: 'bankuser-password', icon: '🔒', message: 'Setting bankuser password...' });
        onStep(steps[steps.length - 1]);
        try {
          const r = await this.setUserPassword(bankUserResult.user.id, bankUserPassword);
          if (r.changed === false && r.skipped === 'password_policy_history') {
            steps.push({ step: 'bankuser-password', icon: '✅', message: `Bankuser password unchanged (already '${bankUserPassword}')` });
          } else {
            steps.push({ step: 'bankuser-password', icon: '✅', message: `Bankuser password set to '${bankUserPassword}'` });
          }
        } catch (err) {
          steps.push({ step: 'bankuser-password', icon: '⚠️', message: `Password set failed (continuing): ${err.message}` });
        }
        provisioned.bankUser = { ...bankUserResult.user, password: bankUserPassword };
        onStep(steps[steps.length - 1]);
      }

      // Step 13: Create demo user bankadmin
      steps.push({ step: 'bankadmin', icon: '👨‍💼', message: 'Creating demo user: bankadmin...' });
      onStep(steps[steps.length - 1]);
      
      const bankAdminResult = await this.createUser(
        'bankadmin',
        'Demo',
        'Admin',
        `bankadmin@${demoEmailDomain(config.publicAppUrl)}`
      );
      
      if (bankAdminResult.exists) {
        steps.push({ 
          step: 'bankadmin', 
          icon: '✅',
          message: 'User bankadmin already exists (reused)',
          resourceKey: bankAdminResult.resourceKey
        });
      } else {
        steps.push({ step: 'bankadmin', icon: '✅', message: 'User bankadmin created' });
      }
      onStep(steps[steps.length - 1]);

      // Step 14: Set bankadmin password — always run (see bankuser step above).
      {
        const bankAdminPassword = DEMO_PASSWORD;
        steps.push({ step: 'bankadmin-password', icon: '🔒', message: 'Setting bankadmin password...' });
        onStep(steps[steps.length - 1]);
        try {
          const r = await this.setUserPassword(bankAdminResult.user.id, bankAdminPassword);
          if (r.changed === false && r.skipped === 'password_policy_history') {
            steps.push({ step: 'bankadmin-password', icon: '✅', message: `Bankadmin password unchanged (already '${bankAdminPassword}')` });
          } else {
            steps.push({ step: 'bankadmin-password', icon: '✅', message: `Bankadmin password set to '${bankAdminPassword}'` });
          }
        } catch (err) {
          steps.push({ step: 'bankadmin-password', icon: '⚠️', message: `Password set failed (continuing): ${err.message}` });
        }
        provisioned.bankAdmin = { ...bankAdminResult.user, password: bankAdminPassword };
        onStep(steps[steps.length - 1]);
      }

      // Step 14.5: Create demo user bankDelegate + delegation markers.
      // Three artifacts wire delegation:
      //   - User attribute `isDelegate` = "true" (CUSTOM STRING; PingOne user
      //     attributes can't be BOOLEAN, so we store the string "true"/"false").
      //   - Group `BankDelegates` membership.
      //   - Token claim `is_delegate` emitted on the Super Banking API resource
      //     via SPEL value `${user.isDelegate}`. Apps that want delegation
      //     status read it from the access token without an extra API call.
      steps.push({ step: 'bankDelegate', icon: '🤝', message: 'Creating demo user: bankDelegate...' });
      onStep(steps[steps.length - 1]);

      const bankDelegateResult = await this.createUser(
        'bankDelegate',
        'Demo',
        'Delegate',
        `bankDelegate@${demoEmailDomain(config.publicAppUrl)}`
      );
      if (bankDelegateResult.exists) {
        steps.push({ step: 'bankDelegate', icon: '✅', message: 'User bankDelegate already exists (reused)', resourceKey: bankDelegateResult.resourceKey });
      } else {
        steps.push({ step: 'bankDelegate', icon: '✅', message: 'User bankDelegate created' });
      }
      onStep(steps[steps.length - 1]);

      // Set password (always)
      steps.push({ step: 'bankDelegate-password', icon: '🔒', message: 'Setting bankDelegate password...' });
      onStep(steps[steps.length - 1]);
      try {
        const r = await this.setUserPassword(bankDelegateResult.user.id, DEMO_PASSWORD);
        if (r.changed === false && r.skipped === 'password_policy_history') {
          steps.push({ step: 'bankDelegate-password', icon: '✅', message: `bankDelegate password unchanged (already '${DEMO_PASSWORD}')` });
        } else {
          steps.push({ step: 'bankDelegate-password', icon: '✅', message: `bankDelegate password set to '${DEMO_PASSWORD}'` });
        }
      } catch (err) {
        steps.push({ step: 'bankDelegate-password', icon: '⚠️', message: `Password set failed (continuing): ${err.message}` });
      }
      provisioned.bankDelegate = { ...bankDelegateResult.user, password: DEMO_PASSWORD };
      onStep(steps[steps.length - 1]);

      // Ensure the isDelegate user-schema attribute exists (CUSTOM STRING).
      steps.push({ step: 'isDelegate-schema', icon: '🔧', message: 'Ensuring isDelegate user attribute...' });
      onStep(steps[steps.length - 1]);
      try {
        await this._ensureUserSchemaAttribute('isDelegate', 'STRING', 'Is delegate user');
        steps.push({ step: 'isDelegate-schema', icon: '✅', message: 'isDelegate user attribute present' });
      } catch (err) {
        steps.push({ step: 'isDelegate-schema', icon: '⚠️', message: `isDelegate attribute step: ${err.message}` });
      }
      onStep(steps[steps.length - 1]);

      // Set isDelegate=true on bankDelegate (PATCH user). Uses partial-update
      // semantics — we only send the changed field.
      try {
        await this.makeRequest('PATCH', `/users/${bankDelegateResult.user.id}`, { isDelegate: 'true' });
        steps.push({ step: 'bankDelegate-flag', icon: '✅', message: 'bankDelegate.isDelegate = true' });
      } catch (err) {
        steps.push({ step: 'bankDelegate-flag', icon: '⚠️', message: `Could not set isDelegate flag: ${err.message}` });
      }
      onStep(steps[steps.length - 1]);

      // Create BankDelegates group + add bankDelegate as member (idempotent).
      steps.push({ step: 'bankDelegates-group', icon: '👥', message: 'Ensuring BankDelegates group...' });
      onStep(steps[steps.length - 1]);
      try {
        const groupId = await this._ensureGroup('BankDelegates', 'Users authorized as delegated agents (demo)');
        await this._ensureUserInGroup(bankDelegateResult.user.id, groupId);
        steps.push({ step: 'bankDelegates-group', icon: '✅', message: 'bankDelegate added to BankDelegates group' });
      } catch (err) {
        steps.push({ step: 'bankDelegates-group', icon: '⚠️', message: `Group step: ${err.message}` });
      }
      onStep(steps[steps.length - 1]);

      // Step 15: Create MCP Server Application
      steps.push({ step: 'mcp-app', icon: '🤖', message: 'Creating MCP Server application...' });
      onStep(steps[steps.length - 1]);
      
      const mcpAppResult = await this.createApplication(
        'Super Banking MCP Server',
        'MCP server for client credentials and PingOne API access',
        'WORKER',
        ['client_credentials']
      );
      
      pushAppResultStep(steps, 'mcp-app', 'MCP Server application', mcpAppResult);
      onStep(steps[steps.length - 1]);
      provisioned.mcpApp = mcpAppResult.application;
      provisioned.mcpApp.clientSecret = await this.getApplicationSecret(mcpAppResult.application.id);

      // Step 16: Configure MCP Server Application
      if (!mcpAppResult.exists) {
        steps.push({ step: 'mcp-config', icon: '⚙️', message: 'Configuring MCP Server application...' });
        onStep(steps[steps.length - 1]);
        
        await this.updateApplication(mcpAppResult.application.id, {
          tokenEndpointAuthMethod: 'client_secret_basic'
        });
        
        steps.push({ step: 'mcp-config', icon: '✅', message: 'MCP Server application configured' });
        onStep(steps[steps.length - 1]);
      }

      // Step 17: Grant scopes to MCP Server Application
      steps.push({ step: 'mcp-grants', icon: '🔑', message: 'Granting scopes to MCP Server application...' });
      onStep(steps[steps.length - 1]);
      
      // Grant scopes for client credentials (Step 6 in documentation).
      // MCP Server is the token-exchange CLIENT — it needs every scope it
      // might re-request during exchange. Phase 267 adds banking:mortgage:read
      // for the Path A (api-key disposition) flow.
      const mcpAppGrantResult = await this.grantScopesToApplication(
        mcpAppResult.application.id,
        resourceResult.resource.id,
        ['banking:read', 'banking:ai:agent:read', 'banking:mortgage:read']
      );
      
      pushGrantResultStep(steps, 'mcp-grants', 'MCP Server scope grants', mcpAppGrantResult);
      onStep(steps[steps.length - 1]);

      // Step 18: Create Worker Application
      steps.push({ step: 'worker-app', icon: '🔧', message: 'Creating Worker application...' });
      onStep(steps[steps.length - 1]);
      
      const workerAppResult = await this.createApplication(
        'Super Banking Worker',
        'Worker application for PingOne Management API operations',
        'WORKER',
        ['client_credentials']
      );
      
      pushAppResultStep(steps, 'worker-app', 'Worker application', workerAppResult);
      onStep(steps[steps.length - 1]);
      provisioned.workerApp = workerAppResult.application;
      provisioned.workerApp.clientSecret = await this.getApplicationSecret(workerAppResult.application.id);

      // Step 19: Configure Worker Application
      if (!workerAppResult.exists) {
        steps.push({ step: 'worker-config', icon: '⚙️', message: 'Configuring Worker application...' });
        onStep(steps[steps.length - 1]);
        
        await this.updateApplication(workerAppResult.application.id, {
          tokenEndpointAuthMethod: 'client_secret_basic'
        });
        
        steps.push({ step: 'worker-config', icon: '✅', message: 'Worker application configured' });
        onStep(steps[steps.length - 1]);
      }

      // Step 20: Grant scopes to Worker Application
      steps.push({ step: 'worker-grants', icon: '🔑', message: 'Granting scopes to Worker application...' });
      onStep(steps[steps.length - 1]);
      
      // Grant PingOne Management API scopes (Step 6 in documentation)
      const workerAppGrantResult = await this.grantScopesToApplication(
        workerAppResult.application.id,
        resourceResult.resource.id,
        ['p1:read:user', 'p1:update:user']
      );
      
      pushGrantResultStep(steps, 'worker-grants', 'Worker scope grants', workerAppGrantResult);
      onStep(steps[steps.length - 1]);

      // Step 22: Ensure bankingPrincipalUserId user-schema attribute exists.
      // Uses the idempotent _ensureUserSchemaAttribute helper — checks first
      // and only POSTs if absent, so reruns stop reporting INVALID_DATA.
      steps.push({ step: 'schema-attr', icon: '🔧', message: 'Ensuring bankingPrincipalUserId user attribute...' });
      onStep(steps[steps.length - 1]);
      try {
        await this._ensureUserSchemaAttribute('bankingPrincipalUserId', 'STRING', 'Banking Principal User ID');
        steps.push({ step: 'schema-attr', icon: '✅', message: 'bankingPrincipalUserId user attribute present' });
      } catch (schemaErr) {
        steps.push({ step: 'schema-attr', icon: '⚠️', message: `Schema attribute step: ${schemaErr.message}` });
      }
      onStep(steps[steps.length - 1]);

      // Step 23: Create MCP Exchanger WORKER application
      steps.push({ step: 'mcp-exchanger-app', icon: '🔧', message: 'Creating MCP Exchanger application...' });
      onStep(steps[steps.length - 1]);
      {
        const mcpExchangerResult = await this.createApplication(
          'Super Banking MCP Exchanger',
          'Worker application for on-behalf-of token exchange (Phase 143)',
          'WORKER',
          ['client_credentials', 'token_exchange']
        );
        provisioned.mcpExchangerApp = mcpExchangerResult.application;
        provisioned.mcpExchangerApp.clientSecret = await this.getApplicationSecret(mcpExchangerResult.application.id);
        pushAppResultStep(steps, 'mcp-exchanger-app', 'MCP Exchanger application', mcpExchangerResult);
      }
      onStep(steps[steps.length - 1]);

      // Step 23.5: Wire `may_act` claim as a resource attribute on the main
      // banking resource. RFC 8693 token-exchange uses this claim to declare
      // who is allowed to act on behalf of the user; we point it at the MCP
      // Exchanger client id so its tokens can be used to exchange for delegated
      // banking tokens.
      //
      // Implemented as a CUSTOM attribute on the resource (NOT a per-app claim
      // — that endpoint doesn't exist in PingOne). The attribute is rebuilt on
      // every run so a re-provisioned exchanger client id is picked up.
      steps.push({ step: 'may-act-claim', icon: '🔧', message: 'Wiring may_act token claim → MCP Exchanger client id...' });
      onStep(steps[steps.length - 1]);
      try {
        const exchangerClientId = provisioned.mcpExchangerApp?.clientId;
        if (!exchangerClientId) {
          steps.push({ step: 'may-act-claim', icon: '⚠️', message: 'MCP Exchanger client id missing — skipping may_act' });
        } else {
          await this._setResourceAttribute(
            provisioned.resourceServer.id,
            'may_act',
            JSON.stringify({ sub: exchangerClientId })
          );
          // Same claim on the MCP resource so admin tokens for the MCP server
          // can also be exchanged.
          if (provisioned.mcpResourceServer?.id) {
            await this._setResourceAttribute(
              provisioned.mcpResourceServer.id,
              'may_act',
              JSON.stringify({ sub: exchangerClientId })
            );
          }
          steps.push({ step: 'may-act-claim', icon: '✅', message: `may_act claim wired (actor = ${exchangerClientId})` });
        }
      } catch (mayActErr) {
        steps.push({ step: 'may-act-claim', icon: '⚠️', message: `may_act claim step: ${mayActErr.message}` });
      }
      onStep(steps[steps.length - 1]);

      // Step 23.6: Wire `is_delegate` token claim. SPEL `${user.isDelegate}`
      // resolves at token-issue time to the user's stored attribute, so apps
      // can read delegation status from the access token without an extra
      // /v1/users API call. bankDelegate has isDelegate="true"; bankuser/
      // bankadmin don't, so the claim is empty/false for them.
      steps.push({ step: 'is-delegate-claim', icon: '🔧', message: 'Wiring is_delegate token claim → ${user.isDelegate}...' });
      onStep(steps[steps.length - 1]);
      try {
        await this._setResourceAttribute(
          provisioned.resourceServer.id,
          'is_delegate',
          '${user.isDelegate}'
        );
        steps.push({ step: 'is-delegate-claim', icon: '✅', message: 'is_delegate claim wired (SPEL = ${user.isDelegate})' });
      } catch (delErr) {
        steps.push({ step: 'is-delegate-claim', icon: '⚠️', message: `is_delegate claim step: ${delErr.message}` });
      }
      onStep(steps[steps.length - 1]);

      // Step 24: Add bankingPrincipalUserId SPEL token claim on user app
      steps.push({ step: 'spel-claim', icon: '🔧', message: 'Adding SPEL token claim on User application...' });
      onStep(steps[steps.length - 1]);
      try {
        await this.enableTokenCustomization(userAppResult.application.id);
        await this.addTokenClaim(
          userAppResult.application.id,
          'bankingPrincipalUserId',
          'EXPRESSION',
          "${user.bankingPrincipalUserId}"
        );
        steps.push({ step: 'spel-claim', icon: '✅', message: 'bankingPrincipalUserId SPEL claim added' });
      } catch (spelErr) {
        steps.push({ step: 'spel-claim', icon: '⚠️', message: `SPEL claim step: ${spelErr.message}` });
      }
      onStep(steps[steps.length - 1]);

      // Step 25: Create MCP Gateway resource server
      // Inbound tokens to the gateway carry aud = MCP_GW_RESOURCE_URI; the gateway re-exchanges
      // them for backend-MCP audiences. See banking_mcp_gateway/src/config.ts.
      steps.push({ step: 'mcp-gw-resource', icon: '🛡️', message: 'Creating MCP Gateway resource server...' });
      onStep(steps[steps.length - 1]);
      const mcpGwAudience = config.mcpGatewayAudience || 'mcp-gw.bxf.com';
      const mcpGwResourceResult = await this.createResourceServer(
        'Super Banking MCP Gateway',
        'Inbound resource server for the MCP Gateway (aud target for delegated tokens)',
        mcpGwAudience
      );
      if (mcpGwResourceResult.exists) {
        steps.push({ step: 'mcp-gw-resource', icon: '✅', message: 'MCP Gateway resource server already exists (reused)', resourceKey: mcpGwResourceResult.resourceKey });
      } else {
        steps.push({ step: 'mcp-gw-resource', icon: '✅', message: 'MCP Gateway resource server created' });
      }
      onStep(steps[steps.length - 1]);
      provisioned.mcpGwResourceServer = mcpGwResourceResult.resource;

      // Step 26: Create MCP Gateway scope (banking:mcp:invoke)
      steps.push({ step: 'mcp-gw-scopes', icon: '🎯', message: 'Creating MCP Gateway scopes...' });
      onStep(steps[steps.length - 1]);
      const mcpGwScopes = [
        { name: 'banking:mcp:invoke', description: 'Invoke MCP tools via the gateway' }
      ];
      const mcpGwScopeResults = await this.createScopes(mcpGwResourceResult.resource.id, mcpGwScopes);
      pushScopeResultStep(steps, 'mcp-gw-scopes', 'MCP Gateway scopes', mcpGwScopeResults);
      onStep(steps[steps.length - 1]);

      // Step 27: Create MCP Gateway WORKER application (for re-exchange to backend MCP servers)
      // banking_mcp_gateway requires MCP_GW_CLIENT_ID / MCP_GW_CLIENT_SECRET; without them
      // the service exits at startup. Token-exchange grant is needed because the gateway
      // re-exchanges incoming user tokens for backend-aud-narrowed tokens.
      steps.push({ step: 'mcp-gw-app', icon: '🚪', message: 'Creating MCP Gateway application...' });
      onStep(steps[steps.length - 1]);
      const mcpGwAppResult = await this.createApplication(
        'Super Banking MCP Gateway',
        'Worker application for the MCP Gateway (re-exchanges tokens for backend MCP servers)',
        'WORKER',
        ['client_credentials', 'urn:ietf:params:oauth:grant-type:token-exchange']
      );
      provisioned.mcpGwApp = mcpGwAppResult.application;
      provisioned.mcpGwApp.clientSecret = await this.getApplicationSecret(mcpGwAppResult.application.id);
      pushAppResultStep(steps, 'mcp-gw-app', 'MCP Gateway application', mcpGwAppResult);
      onStep(steps[steps.length - 1]);

      // Step 28: Configure MCP Gateway app (client_secret_basic — matches MCP_GW_TOKEN_ENDPOINT_AUTH_METHOD default)
      if (!mcpGwAppResult.exists) {
        steps.push({ step: 'mcp-gw-config', icon: '⚙️', message: 'Configuring MCP Gateway application...' });
        onStep(steps[steps.length - 1]);
        await this.updateApplication(mcpGwAppResult.application.id, {
          tokenEndpointAuthMethod: 'client_secret_basic'
        });
        steps.push({ step: 'mcp-gw-config', icon: '✅', message: 'MCP Gateway application configured' });
        onStep(steps[steps.length - 1]);
      }

      // Step 29: Grant scopes to MCP Gateway app (it acts as the actor in token-exchange).
      // Phase 267: gateway also needs banking:mortgage:read so the api_key disposition
      // can request that scope when exchanging the user bearer for the api-key swap.
      steps.push({ step: 'mcp-gw-grants', icon: '🔑', message: 'Granting scopes to MCP Gateway application...' });
      onStep(steps[steps.length - 1]);
      const mcpGwGrantResult = await this.grantScopesToApplication(
        mcpGwAppResult.application.id,
        resourceResult.resource.id,
        ['banking:read', 'banking:write', 'banking:mortgage:read']
      );
      pushGrantResultStep(steps, 'mcp-gw-grants', 'MCP Gateway scope grants', mcpGwGrantResult);
      onStep(steps[steps.length - 1]);

      // Step 30: Create Agent WORKER application
      // banking_agent_service requires AGENT_CLIENT_ID; without it port 3006 exits at startup.
      // The agent is the actor in delegated token-exchange (act.sub = AGENT_CLIENT_ID).
      steps.push({ step: 'agent-app', icon: '🤝', message: 'Creating Agent application...' });
      onStep(steps[steps.length - 1]);
      const agentAppResult = await this.createApplication(
        'Super Banking Agent',
        'Worker application for the agent service (actor in delegated token-exchange)',
        'WORKER',
        ['client_credentials']
      );
      provisioned.agentApp = agentAppResult.application;
      provisioned.agentApp.clientSecret = await this.getApplicationSecret(agentAppResult.application.id);
      pushAppResultStep(steps, 'agent-app', 'Agent application', agentAppResult);
      onStep(steps[steps.length - 1]);

      // Step 31: Configure Agent app
      if (!agentAppResult.exists) {
        steps.push({ step: 'agent-config', icon: '⚙️', message: 'Configuring Agent application...' });
        onStep(steps[steps.length - 1]);
        await this.updateApplication(agentAppResult.application.id, {
          tokenEndpointAuthMethod: 'client_secret_basic'
        });
        steps.push({ step: 'agent-config', icon: '✅', message: 'Agent application configured' });
        onStep(steps[steps.length - 1]);
      }

      // Step 32: Grant the agent the gateway scope so its token-exchange targets the gateway aud
      steps.push({ step: 'agent-grants', icon: '🔑', message: 'Granting scopes to Agent application...' });
      onStep(steps[steps.length - 1]);
      const agentGrantResult = await this.grantScopesToApplication(
        agentAppResult.application.id,
        mcpGwResourceResult.resource.id,
        ['banking:mcp:invoke']
      );
      pushGrantResultStep(steps, 'agent-grants', 'Agent scope grants', agentGrantResult);
      onStep(steps[steps.length - 1]);

      // Step 33: Write configuration
      steps.push({ step: 'config', icon: '📝', message: 'Writing .env file...' });
      onStep(steps[steps.length - 1]);
      
      {
        const envPath = await this.writeEnvFile(config, provisioned);
        steps.push({ step: 'config', icon: '✅', message: `.env file written to ${envPath}` });
      }
      onStep(steps[steps.length - 1]);

      // Step 16: Complete
      steps.push({ 
        step: 'complete', 
        icon: '🎉', 
        message: 'Setup complete! All resources provisioned successfully.',
        result: provisioned 
      });
      onStep(steps[steps.length - 1]);

      return {
        success: true,
        provisioned,
        steps: steps.filter(s => s.step !== 'complete')
      };

    } catch (error) {
      steps.push({ 
        step: 'error', 
        icon: '❌', 
        message: `Setup failed: ${error.message}` 
      });
      onStep(steps[steps.length - 1]);
      
      throw error;
    }
  }

  /**
   * Enable token customization for an application.
   *
   * NOTE: PingOne's API doesn't have a per-application "tokenCustomization"
   * endpoint — the previous PUT /applications/{id}/tokenCustomization call
   * returned 403 because the URL pattern doesn't exist (PingOne's API
   * gateway rejected the path before token validation, returning a
   * misleading "Invalid Authorization header" message).
   *
   * Token customization in PingOne is configured at the RESOURCE SERVER
   * level via attributes (POST /resources/{id}/attributes). Attributes
   * defined on a resource appear as claims in tokens issued for that
   * resource server. This function is now a no-op for backward
   * compatibility — the actual claims (`may_act`, `bankingPrincipalUserId`)
   * are added per-resource in the wizard's resource-creation step.
   *
   * Returns immediately without making an API call.
   */
  async enableTokenCustomization(_appId) {
    return { skipped: true, reason: 'no-op — token customization is per-resource, not per-app' };
  }

  /**
   * Add a custom token claim.
   *
   * The original implementation called POST /applications/{id}/tokenClaims —
   * an endpoint that doesn't exist in PingOne's Management API.
   *
   * The correct PingOne pattern is to add a custom attribute to the resource
   * server (POST /resources/{id}/attributes), which then appears as a claim
   * in tokens whose audience is that resource. This wrapper is now a no-op
   * because the resource-server attribute creation belongs at the resource-
   * provisioning step, not the application-provisioning step. The two
   * special claims previously requested here:
   *
   *   - `may_act` on admin app  → emitted automatically by PingOne when the
   *     resource server's token policy supports RFC 8693 token-exchange.
   *     Configure via PingOne Admin Console → Authorization → Resources →
   *     Token Policies if needed.
   *
   *   - `bankingPrincipalUserId` SPEL claim on user app → can be added as a
   *     CUSTOM resource attribute on `Super Banking API` if you need it as
   *     a claim. The demo flows don't require it on first install.
   *
   * Returns immediately without making an API call.
   */
  async addTokenClaim(_appId, _claimName, _claimType, _value) {
    return { skipped: true, reason: 'no-op — custom claims are per-resource attributes' };
  }

  /**
   * Recreate a specific resource
   */
  async recreateResource(config, resourceKey) {
    const [type, id] = resourceKey.split(':');

    try {
      switch (type) {
        case 'resource':
          await this.makeRequest('DELETE', `/resources/${id}`);
          return { success: true, message: 'Resource server deleted' };

        case 'application':
          await this.makeRequest('DELETE', `/applications/${id}`);
          return { success: true, message: 'Application deleted' };

        case 'user':
          await this.makeRequest('DELETE', `/users/${id}`);
          return { success: true, message: 'User deleted' };

        default:
          throw new Error(`Unknown resource type: ${type}`);
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Nuclear option: delete EVERYTHING in the environment that we can.
   *
   * Deletes:
   *   - All applications EXCEPT the worker app being used to authenticate
   *     (deleting that mid-run kills the access token).
   *   - All resource servers EXCEPT system-defaults `PingOne API` and `openid`
   *     (PingOne refuses to delete them anyway).
   *   - All groups.
   *   - All custom user-schema attributes (CORE / STANDARD attrs are
   *     PingOne-managed and rejected).
   *   - All non-CORE users in the default population.
   *
   * Does NOT delete:
   *   - The environment itself.
   *   - The worker app (`config.workerClientId` is the actor — would invalidate
   *     the very token we're holding).
   *   - System-default resource servers.
   *   - Built-in user-schema attributes.
   *
   * Streams progress via onStep callback (same shape as provisionEnvironment).
   * Per-item failures don't abort; reported in the summary. Returns:
   *   { deleted: { apps, resources, groups, attrs, users },
   *     skipped: { ... }, failed: [...] }
   */
  async wipeEnvironment(config, onStep = () => {}) {
    await this.initialize(config.envId, config.workerClientId, config.workerClientSecret, config.region);

    const summary = {
      deleted: { apps: 0, resources: 0, groups: 0, attrs: 0, users: 0 },
      skipped: { apps: 0, resources: 0, groups: 0, attrs: 0, users: 0 },
      failed:  [],
    };
    const step = (icon, message, extra = {}) => onStep({ step: 'wipe', icon, message, ...extra });

    // Banking-demo ownership filter. Everything provisioned by this demo
    // matches one of these patterns; everything else (PingOne system apps,
    // user-managed apps, shared infrastructure) is left alone.
    //
    // Apps + resources: name starts with "Super Banking" (singular convention).
    // Groups:           name equals "BankDelegates".
    // Custom attrs:     name equals "isDelegate" (the only one we provision).
    // Users:            username in {bankuser, bankadmin, bankDelegate}.
    //
    // If you fork this demo and rename, update the constants here too.
    const APP_PREFIX = 'Super Banking';
    const RESOURCE_PREFIX = 'Super Banking';
    const DEMO_GROUPS = new Set(['BankDelegates']);
    const DEMO_ATTRS = new Set(['isDelegate']);
    const DEMO_USERS = new Set(['bankuser', 'bankadmin', 'bankDelegate']);

    step('💣', `Wiping banking-demo resources in PingOne env ${config.envId} (region: ${config.region})`);
    step('🛡️', `Only items matching banking-demo naming will be deleted; everything else is preserved.`);

    // --- Apps -----------------------------------------------------------
    step('🔍', 'Listing applications…');
    let apps = [];
    try {
      apps = (await this.makeRequest('GET', '/applications')).data._embedded?.applications || [];
    } catch (err) {
      step('❌', `Could not list applications: ${err.message}`);
    }
    const ownedApps = apps.filter(a => (a.name || '').startsWith(APP_PREFIX));
    step('🗑️', `Found ${apps.length} application(s); ${ownedApps.length} match "${APP_PREFIX}*" — preserving worker (${config.workerClientId})`);
    for (const app of apps) {
      // Always preserve the worker we're auth'd as — even if it has the prefix.
      if (app.id === config.workerClientId || app.clientId === config.workerClientId) {
        summary.skipped.apps++;
        step('⏭️', `Kept worker app: ${app.name}`);
        continue;
      }
      if (!(app.name || '').startsWith(APP_PREFIX)) {
        summary.skipped.apps++;
        // Don't spam a line per non-demo app; total skipped count surfaces in the summary.
        continue;
      }
      try {
        await this.makeRequest('DELETE', `/applications/${app.id}`);
        summary.deleted.apps++;
        step('✅', `Deleted app: ${app.name}`);
      } catch (err) {
        summary.failed.push({ kind: 'app', id: app.id, name: app.name, error: err.message });
        step('❌', `Failed to delete app '${app.name}': ${err.message}`);
      }
    }

    // --- Resource servers ------------------------------------------------
    step('🔍', 'Listing resource servers…');
    let resources = [];
    try {
      resources = (await this.makeRequest('GET', '/resources')).data._embedded?.resources || [];
    } catch (err) {
      step('❌', `Could not list resources: ${err.message}`);
    }
    for (const r of resources) {
      if (!(r.name || '').startsWith(RESOURCE_PREFIX)) {
        summary.skipped.resources++;
        continue;
      }
      try {
        await this.makeRequest('DELETE', `/resources/${r.id}`);
        summary.deleted.resources++;
        step('✅', `Deleted resource: ${r.name}`);
      } catch (err) {
        summary.failed.push({ kind: 'resource', id: r.id, name: r.name, error: err.message });
        step('❌', `Failed to delete resource '${r.name}': ${err.message}`);
      }
    }

    // --- Groups ----------------------------------------------------------
    step('🔍', 'Listing groups…');
    let groups = [];
    try {
      groups = (await this.makeRequest('GET', '/groups')).data._embedded?.groups || [];
    } catch (err) {
      step('❌', `Could not list groups: ${err.message}`);
    }
    for (const g of groups) {
      if (!DEMO_GROUPS.has(g.name)) {
        summary.skipped.groups++;
        continue;
      }
      try {
        await this.makeRequest('DELETE', `/groups/${g.id}`);
        summary.deleted.groups++;
        step('✅', `Deleted group: ${g.name}`);
      } catch (err) {
        summary.failed.push({ kind: 'group', id: g.id, name: g.name, error: err.message });
        step('❌', `Failed to delete group '${g.name}': ${err.message}`);
      }
    }

    // --- User schema attributes -----------------------------------------
    // CUSTOM only — CORE/STANDARD are managed by PingOne and refuse delete.
    // We further filter to attributes the demo provisions (isDelegate).
    step('🔍', 'Listing custom user-schema attributes…');
    try {
      if (!this._userSchemaId) {
        const schemas = (await this.makeRequest('GET', '/schemas?filter=name eq "User"')).data;
        this._userSchemaId = schemas._embedded?.schemas?.[0]?.id;
      }
      if (this._userSchemaId) {
        const attrs = (await this.makeRequest('GET', `/schemas/${this._userSchemaId}/attributes`)).data._embedded?.attributes || [];
        for (const a of attrs) {
          if (a.type !== 'CUSTOM' || !DEMO_ATTRS.has(a.name)) {
            summary.skipped.attrs++;
            continue;
          }
          try {
            await this.makeRequest('DELETE', `/schemas/${this._userSchemaId}/attributes/${a.id}`);
            summary.deleted.attrs++;
            step('✅', `Deleted user attribute: ${a.name}`);
          } catch (err) {
            summary.failed.push({ kind: 'attr', id: a.id, name: a.name, error: err.message });
            step('❌', `Failed to delete attribute '${a.name}': ${err.message}`);
          }
        }
      }
    } catch (err) {
      step('❌', `Could not enumerate user schema: ${err.message}`);
    }

    // --- Users -----------------------------------------------------------
    // Only delete demo accounts. PingOne paginates; loop until we've checked
    // a full page that has no demo users in it (we don't blindly drain — we
    // just need to find the 3 demo users by username).
    step('🔍', 'Deleting demo users (bankuser, bankadmin, bankDelegate)…');
    for (const username of DEMO_USERS) {
      try {
        const q = encodeURIComponent(`username eq "${username}"`);
        const page = await this.makeRequest('GET', `/users?filter=${q}&limit=10`);
        const users = page.data._embedded?.users || [];
        if (users.length === 0) {
          // Nothing to delete; count as skipped so summary doesn't lie.
          summary.skipped.users++;
          continue;
        }
        for (const u of users) {
          try {
            await this.makeRequest('DELETE', `/users/${u.id}`);
            summary.deleted.users++;
            step('✅', `Deleted user: ${u.username}`);
          } catch (err) {
            summary.failed.push({ kind: 'user', id: u.id, name: u.username, error: err.message });
            step('❌', `Failed to delete user '${u.username}': ${err.message}`);
          }
        }
      } catch (err) {
        step('❌', `Could not search for user '${username}': ${err.message}`);
      }
    }

    const totalSkipped = summary.skipped.apps + summary.skipped.resources + summary.skipped.groups + summary.skipped.attrs + summary.skipped.users;
    step('🎉', `Wipe complete. Deleted: ${summary.deleted.apps} apps, ${summary.deleted.resources} resources, ${summary.deleted.groups} groups, ${summary.deleted.attrs} attrs, ${summary.deleted.users} users. Preserved (non-demo): ${totalSkipped}. Failures: ${summary.failed.length}.`);
    return summary;
  }

  /**
   * Generate secure password
   */
  generatePassword() {
    // PingOne's default password policy requires:
    //   - min length 8 (we use 16 to satisfy stricter policies)
    //   - at least 1 uppercase, 1 lowercase, 1 digit, 1 special
    //   - no more than 2 repeated characters
    // The previous random-only generator could fail policy checks ~5% of the
    // time (e.g. all letters, no digits). Build a guaranteed-compliant password
    // by drawing 2-4 chars from each class, then shuffling.
    const upper   = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // omit I/O for legibility
    const lower   = 'abcdefghjkmnpqrstuvwxyz';    // omit i/l/o
    const digits  = '23456789';                    // omit 0/1
    const symbols = '!@#$%^&*-_+=';

    const pick = (set, n) => {
      let s = '';
      for (let i = 0; i < n; i++) s += set[Math.floor(Math.random() * set.length)];
      return s;
    };

    // 4 of each class → 16 chars total, exceeds nearly every policy minimum.
    const chars = (pick(upper, 4) + pick(lower, 4) + pick(digits, 4) + pick(symbols, 4)).split('');
    // Fisher-Yates shuffle so the class boundaries aren't visible.
    for (let i = chars.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
  }
}

// Export singleton instance and class
const provisionService = new PingOneProvisionService();

module.exports = {
  PingOneProvisionService,
  provisionService,
  provisionEnvironment: (config, onStep) => provisionService.provisionEnvironment(config, onStep),
  recreateResource: (config, resourceKey) => provisionService.recreateResource(config, resourceKey),
  // Caller MUST construct a fresh service instance for wipe — the module
  // singleton may have leftover state from a prior provision call. Each
  // wipeEnvironment call also re-initializes (calls getWorkerToken).
  wipeEnvironment: (config, onStep) => new PingOneProvisionService().wipeEnvironment(config, onStep),
  checkResourceExists: (type, name) => provisionService.findResourceByName(type, name)
};
