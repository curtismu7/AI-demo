#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';

/**
 * Upload the canonical LLM2 directive to the live Helix agent.
 *
 * The Helix Management API (undocumented but live, surfaced via the same
 * x-api-key as conversations) exposes:
 *   GET  /environments/{env_id}/agents/{agent_name}      — full agent JSON
 *   PUT  /environments/{env_id}/agents/{agent_name}      — round-trip update
 *
 * The directive lives at:
 *   entities.entities.<taskNodeId>.withMultimodalToTextGeneration.prompt.directive
 *
 * Strategy: GET the current agent → find the (single) task node that owns
 * a `withMultimodalToTextGeneration.prompt.directive` field → diff against
 * the desired directive (read from HELIX_LLM2_DIRECTIVE.md) → if different,
 * mutate + bump that node's `version` epoch + PUT the whole object back.
 *
 * Source of truth for the directive text: HELIX_LLM2_DIRECTIVE.md at the
 * repo root. Section delimited by the line containing only `---` after
 * "## Directive text (copy from below the `---` line)" and the end of file.
 *
 * Usage:
 *   node scripts/uploadHelixDirective.js              # apply
 *   node scripts/uploadHelixDirective.js --dry-run    # preview only
 *   node scripts/uploadHelixDirective.js --diff       # print before/after
 *
 * Reads Helix config from configStore (which respects env vars + the
 * <agent>.json fallback) — same chain `helixLlmService.js` uses.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DIRECTIVE_FILE = path.join(REPO_ROOT, 'HELIX_LLM2_DIRECTIVE.md');

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const SHOW_DIFF = argv.includes('--diff') || DRY_RUN;
const HELP = argv.includes('--help') || argv.includes('-h');

if (HELP) {
  console.log(`
Usage: node scripts/uploadHelixDirective.js [--dry-run] [--diff]

Reads the directive from HELIX_LLM2_DIRECTIVE.md and uploads it to the
configured Helix agent (default LLM2). Idempotent: skips PUT when the
current directive already matches.

Flags:
  --dry-run   Read agent + show diff; do not PUT.
  --diff      Print before/after even on apply.
  --help, -h  This text.

Config (resolved via configStore — env vars or <agent>.json file):
  HELIX_BASE_URL          default: https://openam-helix.forgeblocks.com
  HELIX_ENVIRONMENT_ID    default: fe213c3c-9c1d-4bdb-954a-a22879dad26d
  HELIX_AGENT_ID          default: LLM2
  HELIX_API_KEY           required (auto-loaded from <agent>.json)
`);
  process.exit(0);
}

function readDirectiveText() {
  if (!fs.existsSync(DIRECTIVE_FILE)) {
    throw new Error(`Directive source missing: ${DIRECTIVE_FILE}`);
  }
  const raw = fs.readFileSync(DIRECTIVE_FILE, 'utf8');
  // Find the section after "## Directive text (copy from below the `---` line)"
  // and grab everything from the first `---` line after it to end of file.
  const headerIdx = raw.indexOf('## Directive text');
  if (headerIdx === -1) {
    throw new Error(`Could not find "## Directive text" header in ${DIRECTIVE_FILE}`);
  }
  const after = raw.slice(headerIdx);
  // First `---` line after the header marks the start of the directive body.
  const m = after.match(/\n---\n([\s\S]+)$/);
  if (!m) {
    throw new Error(`Could not find "---" delimiter under "## Directive text" in ${DIRECTIVE_FILE}`);
  }
  return m[1].trim();
}

function findTaskNodeWithDirective(agent) {
  const entities = agent?.entities?.entities;
  if (!entities || typeof entities !== 'object') return null;
  for (const [nodeId, node] of Object.entries(entities)) {
    if (node?.withMultimodalToTextGeneration?.prompt) return { nodeId, node };
  }
  return null;
}

function shortHash(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 12);
}

function diffPreview(currentText, newText) {
  const cur = (currentText || '').trim();
  const next = (newText || '').trim();
  return {
    sameLength: cur.length === next.length,
    currentChars: cur.length,
    newChars: next.length,
    currentHash: cur ? shortHash(cur) : '(empty)',
    newHash: next ? shortHash(next) : '(empty)',
    currentPreview: cur ? `${cur.slice(0, 120)}…` : '(empty)',
    newPreview: next ? `${next.slice(0, 120)}…` : '(empty)',
  };
}

async function main() {
  const configStore = require('../services/configStore');
  const baseUrl = configStore.getEffective('helix_base_url');
  const apiKey = configStore.getEffective('helix_api_key');
  const envId = configStore.getEffective('helix_environment_id');
  const agentId = configStore.getEffective('helix_agent_id');

  const missing = [];
  if (!baseUrl) missing.push('helix_base_url');
  if (!apiKey) missing.push('helix_api_key (drop LLM2.json next to README, or set HELIX_API_KEY)');
  if (!envId) missing.push('helix_environment_id');
  if (!agentId) missing.push('helix_agent_id');
  if (missing.length) {
    console.error(`Missing Helix config: ${missing.join(', ')}`);
    process.exit(1);
  }

  console.log(`Helix base:   ${baseUrl}`);
  console.log(`Environment:  ${envId}`);
  console.log(`Agent:        ${agentId}`);
  console.log(`Mode:         ${DRY_RUN ? 'DRY-RUN (no write)' : 'APPLY'}`);
  console.log('');

  const newDirective = readDirectiveText();
  console.log(`Loaded directive from ${path.relative(REPO_ROOT, DIRECTIVE_FILE)} (${newDirective.length} chars)`);

  // Helix base may include trailing slash and/or already include /dpc/jas/helix/v1.
  const apiBase = String(baseUrl).replace(/\/+$/, '').match(/\/dpc\/jas\/helix\/v1$/)
    ? String(baseUrl).replace(/\/+$/, '')
    : `${String(baseUrl).replace(/\/+$/, '')}/dpc/jas/helix/v1`;

  const agentUrl = `${apiBase}/environments/${envId}/agents/${agentId}`;

  // Step 1: GET
  console.log(`\n→ GET  ${agentUrl}`);
  const getRes = await fetch(agentUrl, {
    headers: { 'x-api-key': apiKey, accept: 'application/json' },
  });
  if (!getRes.ok) {
    const body = await getRes.text();
    console.error(`GET failed: ${getRes.status} ${body.slice(0, 500)}`);
    process.exit(1);
  }
  const agentResp = await getRes.json();
  // Per the research, response is an array; element [0] is the agent.
  const agent = Array.isArray(agentResp) ? agentResp[0] : agentResp;
  if (!agent || !agent.entities) {
    console.error('GET succeeded but response shape is unexpected (no .entities). Aborting to avoid PUTing a wrong body.');
    console.error('Response keys:', Object.keys(agentResp || {}));
    process.exit(1);
  }
  console.log(`✓ GET ok — agent state=${agent.state || '?'}, top-level keys: ${Object.keys(agent).join(', ')}`);

  // Step 2: locate directive owner
  const found = findTaskNodeWithDirective(agent);
  if (!found) {
    console.error('Could not find a task node with .withMultimodalToTextGeneration.prompt in the agent. The directive owner may have moved.');
    console.error('Entity node ids:', Object.keys(agent.entities?.entities || {}));
    process.exit(1);
  }
  const { nodeId, node } = found;
  const currentDirective = node.withMultimodalToTextGeneration.prompt.directive || '';
  console.log(`✓ Directive owner found: entities.entities.${nodeId}.withMultimodalToTextGeneration.prompt.directive`);

  const dp = diffPreview(currentDirective, newDirective);
  console.log(`\nCurrent: ${dp.currentChars} chars  hash=${dp.currentHash}`);
  console.log(`New:     ${dp.newChars} chars  hash=${dp.newHash}`);

  if (SHOW_DIFF) {
    console.log(`\n— current preview —\n${dp.currentPreview}`);
    console.log(`\n— new preview —\n${dp.newPreview}`);
  }

  if (currentDirective.trim() === newDirective.trim()) {
    console.log('\n✓ Directive already up-to-date. Nothing to PUT.');
    process.exit(0);
  }

  if (DRY_RUN) {
    console.log('\n(dry-run) Would PUT updated directive. Re-run without --dry-run to apply.');
    process.exit(0);
  }

  // Step 3: mutate + PUT
  // Mutate in place (deep clone via JSON to avoid surprising refs in the source).
  const updated = JSON.parse(JSON.stringify(agent));
  updated.entities.entities[nodeId].withMultimodalToTextGeneration.prompt.directive = newDirective;
  // Bump the entity's version epoch — the research note flagged this as the
  // signal Helix uses for "this entity changed; re-publish."
  if (typeof updated.entities.entities[nodeId].version === 'number' ||
      typeof updated.entities.entities[nodeId].version === 'string') {
    updated.entities.entities[nodeId].version = Date.now();
  } else {
    updated.entities.entities[nodeId].version = Date.now();
  }
  // Top-level state — keep published so the BFF's `agent: { version: 'published' }`
  // call continues to receive responses.
  updated.state = 'published';

  console.log(`\n→ PUT  ${agentUrl}`);
  const putRes = await fetch(agentUrl, {
    method: 'PUT',
    headers: {
      'x-api-key': apiKey,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(updated),
  });
  if (!putRes.ok) {
    const body = await putRes.text();
    console.error(`PUT failed: ${putRes.status} ${body.slice(0, 800)}`);
    console.error('\nIf this is the first time running this script, check the PUT body shape against');
    console.error('the Helix Console DevTools Network tab — capture one manual save and compare.');
    process.exit(1);
  }
  const putBody = await putRes.text();
  console.log(`✓ PUT ok (${putRes.status})${putBody ? ` — response: ${putBody.slice(0, 200)}` : ''}`);

  // Step 4: verify by reading back
  console.log(`\n→ GET  ${agentUrl}  (verify)`);
  const verifyRes = await fetch(agentUrl, { headers: { 'x-api-key': apiKey, accept: 'application/json' } });
  if (verifyRes.ok) {
    const verifyJson = await verifyRes.json();
    const verifyAgent = Array.isArray(verifyJson) ? verifyJson[0] : verifyJson;
    const verifyDirective = verifyAgent?.entities?.entities?.[nodeId]?.withMultimodalToTextGeneration?.prompt?.directive || '';
    const ok = verifyDirective.trim() === newDirective.trim();
    console.log(`${ok ? '✓' : '✗'} Verify ${ok ? 'matches' : 'MISMATCH — directive in Helix differs from source'}.`);
    if (!ok) {
      console.error(`Read-back hash: ${shortHash(verifyDirective.trim())}, expected: ${dp.newHash}`);
      process.exit(2);
    }
  } else {
    console.warn(`Verify GET failed: ${verifyRes.status} — directive likely uploaded but not re-confirmed.`);
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error(`\n✗ uploadHelixDirective failed: ${err.message}`);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
