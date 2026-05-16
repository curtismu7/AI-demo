'use strict';

/**
 * credentialSwap — 3-disposition credential selector for the MCP Gateway.
 *
 * Given a BackendTarget (from routeTool), decides how to credential the outbound
 * request to banking_resource_server:
 *
 *   'apikey'     → Path A: Gateway-only marker. No backend call. Returns masked last4.
 *   'dualtoken'  → Path B: RFC 8693 exchange + id_token forwarded in JSON-RPC body.
 *   'bankingdata'→ Path C: RFC 8693 exchange; exchanged bearer in Authorization header.
 *
 * SPEC COMPLIANCE notes:
 *   - RFC 8693 §2.1: subject_token = inbound user bearer (aud=gateway resource).
 *   - RFC 8707 + RFC 9068: audience of the exchanged token MUST match the resource server's
 *     declared audience (bankingResourceServerResourceUri). Forwarding the inbound user
 *     bearer unchanged would fail at the backend (wrong aud).
 *   - The id_token is NOT subject to RFC 8693 exchange — it is an OIDC identity assertion,
 *     not an authorization grant. It travels separately in the JSON-RPC body params.
 *   - draft-ietf-oauth-identity-chaining: the act.client_id in the exchanged token is the
 *     gateway client — this is the audit trail "user → gateway → banking_resource_server."
 */

import { GatewayConfig } from './config';
import { exchangeTokenForBackend } from './tokenExchange';
import type { BackendTarget } from './router';
import { teachLog } from './teachLogger';

export type CredentialKind = 'oauth_bearer' | 'api_key' | 'dual_token';
export type CredentialPath = 'oauth_bearer' | 'api_key' | 'dual_token';

export interface OutboundCredential {
  kind: CredentialKind;
  credentialPath: CredentialPath;
  /** Bearer authorization header value (includes 'Bearer ' prefix) */
  authorization?: string;
  /** Last 4 chars of the service API key — for Token Chain display only. Full key never leaves gateway. */
  apiKeyMaskedLast4?: string;
  /** Raw id_token fetched from BFF /internal/id-token. Forwarded to banking_resource_server
   *  /identity as JSON-RPC params.idToken in the POST body (NOT a header). */
  idToken?: string;
}

export class IdTokenMissingError extends Error {
  code = 'id_token_missing';
  constructor() {
    super('id_token required for dual_token disposition but absent from session');
    this.name = 'IdTokenMissingError';
  }
}

/**
 * Select the outbound credential descriptor for a given backend target.
 *
 * @param target       BackendTarget from routeTool()
 * @param subjectToken Inbound user bearer (aud=gateway resource, validated upstream)
 * @param idToken      User's id_token from BFF session, or null
 * @param config       Gateway configuration
 */
export async function selectCredentialForBackend(
  target: BackendTarget,
  subjectToken: string,
  idToken: string | null,
  config: GatewayConfig,
): Promise<OutboundCredential> {
  // Path A: api_key — Gateway-only marker. No token exchange; no backend call.
  // The full API key stays in config.demoApiKeyServiceKey and is never serialized.
  // The SPA only ever sees the masked last4 via _meta.apiKeyMaskedLast4.
  if (target === 'apikey') {
    const key = config.demoApiKeyServiceKey || '';
    const last4 = key.length >= 4 ? key.slice(-4) : 'XXXX';
    teachLog.step(1, 1, 'gateway credential disposition selected', { disposition: target });
    return { kind: 'api_key', credentialPath: 'api_key', apiKeyMaskedLast4: last4 };
  }

  // Path B: dual_token — RFC 8693 token exchange + id_token forwarded in JSON-RPC body.
  if (target === 'dualtoken') {
    if (!idToken) throw new IdTokenMissingError();

    // SPEC COMPLIANCE — exchange the user's bearer so the outbound token's `aud` matches
    // banking_resource_server. Forwarding the inbound user bearer unchanged would fail
    // at the backend (RFC 6750 §3 + RFC 8707 audience binding).
    //
    // The id_token is NOT exchanged — it carries identity claims, not authorization.
    // The backend validates id_token.sub == access_token.sub as integrity check.
    const exchangedToken = await exchangeTokenForBackend(
      subjectToken,
      config.bankingResourceServerResourceUri,
      config,
    );
    teachLog.step(1, 1, 'gateway credential disposition selected', { disposition: target, backend_aud: config.bankingResourceServerResourceUri });
    return {
      kind: 'dual_token',
      credentialPath: 'dual_token',
      authorization: `Bearer ${exchangedToken}`,
      idToken,
    };
  }

  // Path C: oauth_bearer — RFC 8693 exchange; exchanged bearer forwarded to
  // banking_resource_server /accounts or /transactions.
  const exchangedToken = await exchangeTokenForBackend(
    subjectToken,
    config.bankingResourceServerResourceUri,
    config,
  );
  teachLog.step(1, 1, 'gateway credential disposition selected', { disposition: target, backend_aud: config.bankingResourceServerResourceUri });
  return {
    kind: 'oauth_bearer',
    credentialPath: 'oauth_bearer',
    authorization: `Bearer ${exchangedToken}`,
  };
}
