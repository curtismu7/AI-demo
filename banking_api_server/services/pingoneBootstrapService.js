// banking_api_server/services/pingoneBootstrapService.js
'use strict';

/**
 * PingOne tenant bootstrap helpers (planning + optional Management API probe).
 * Full create flows (apps, users, resource servers) are phased; this module
 * exposes step descriptions and a safe list-applications probe when credentials exist.
 */

const fs = require('fs').promises;
const path = require('path');
const pingOneClientService = require('./pingOneClientService');

/**
 * Build human-readable bootstrap steps from a manifest object (no API calls).
 * @param {object} manifest
 * @returns {string[]}
 */
function planStepsFromManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    return ['Invalid manifest: expected a JSON object.'];
  }
  const steps = [];
  const v = manifest.version != null ? String(manifest.version) : '?';
  steps.push(`Manifest version ${v}${manifest.about ? ` — ${manifest.about}` : ''}`);

  if (manifest.publicUrlTemplate) {
    steps.push(`Set production URL from template: ${manifest.publicUrlTemplate}`);
    steps.push('Register matching redirect URIs on admin and user OIDC apps (see Application Configuration).');
  }

  const rs = manifest.resourceServer;
  if (rs?.name) {
    steps.push(`Resource server: create "${rs.name}"${rs.audience ? ` (audience ${rs.audience})` : ''}.`);
    const sc = Array.isArray(rs.scopes) ? rs.scopes.length : 0;
    if (sc > 0) {
      steps.push(`Attach ${sc} custom scope(s) to the resource and map them to OIDC apps.`);
    }
  }

  const apps = manifest.applications && typeof manifest.applications === 'object'
    ? manifest.applications
    : {};
  for (const [key, app] of Object.entries(apps)) {
    if (!app || typeof app !== 'object') continue;
    const name = app.name || key;
    const type = app.type || 'WEB_APP';
    steps.push(`Application [${key}]: ${name} (${type})${app.note ? ` — ${app.note}` : ''}`);
  }

  const users = Array.isArray(manifest.demoUsers) ? manifest.demoUsers : [];
  if (users.length > 0) {
    steps.push(`Directory users: create ${users.length} demo user(s) (${users.map(u => u.username).filter(Boolean).join(', ') || 'see manifest'}).`);
  }

  steps.push('Run npm run setup:vercel (repo root) for session store and deployment env vars.');
  steps.push('Use Admin → Demo data → bootstrap Authorize decision endpoints when the Authorize worker is configured.');
  steps.push('Automated apply: npm run pingone:bootstrap (dry-run); add --probe after Management API worker credentials are in config or env.');

  return steps;
}

/**
 * Load and parse a manifest file from disk.
 * @param {string} filePath absolute or relative path
 * @returns {Promise<object>}
 */
async function loadManifestFromPath(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

/**
 * Default path to the committed example manifest (repo root /config).
 * @returns {string}
 */
function getExampleManifestPath() {
  return path.join(__dirname, '../../config/pingone-bootstrap.manifest.example.json');
}

/**
 * Probe PingOne Management API by listing OIDC applications (read-only).
 * Uses pingOneClientService (pingone_client_id / secret or equivalent stored config + env).
 * @returns {Promise<{ ok: boolean, applicationCount?: number, sample?: object[], error?: string, hint?: string }>}
 */
async function probeManagementApiAccess() {
  try {
    const apps = await pingOneClientService.listApplications();
    return {
      ok: true,
      applicationCount: apps.length,
      sample: apps.slice(0, 8).map(a => ({ name: a.name, type: a.type, id: a.id })),
    };
  } catch (err) {
    const msg = err.message || String(err);
    return {
      ok: false,
      error: msg,
      hint:
        'Configure a PingOne worker with Management API access. CIMD registration stores pingone_client_id/secret, ' +
        'or set credentials your deployment uses for client registration.',
    };
  }
}

module.exports = {
  planStepsFromManifest,
  loadManifestFromPath,
  getExampleManifestPath,
  probeManagementApiAccess,
};
