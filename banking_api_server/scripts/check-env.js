/**
 * Startup environment variable validator.
 *
 * Prints a grouped configuration report at server start:
 *   - REQUIRED vars: exits in production if any are missing
 *   - FEATURE GROUPS: warns on partial / unconfigured optional groups
 *
 * Skipped entirely in test environments.
 * Usage: require('./scripts/check-env') near top of server.js.
 */

const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN  = '\x1b[32m';
const CYAN   = '\x1b[36m';
const DIM    = '\x1b[2m';

// ── Required vars — missing = fatal in production ─────────────────────────────
const REQUIRED = [
  { name: 'PINGONE_ENVIRONMENT_ID',        desc: 'PingOne tenant environment UUID' },
  { name: 'PINGONE_ADMIN_CLIENT_ID',       desc: 'Admin OAuth app client ID' },
  { name: 'PINGONE_ADMIN_CLIENT_SECRET',   desc: 'Admin OAuth app client secret' },
  { name: 'PINGONE_USER_CLIENT_ID',        desc: 'User OAuth app client ID' },
  { name: 'PINGONE_USER_CLIENT_SECRET',    desc: 'User OAuth app client secret' },
  { name: 'SESSION_SECRET',                desc: 'Express session signing secret (min 32 chars)' },
  { name: 'PUBLIC_APP_URL',                desc: 'BFF public origin — drives OAuth redirect URIs' },
];

// ── Feature groups — printed as a status table ───────────────────────────────
// Each group: { label, tag, vars: [{name, desc}] }
// A group is CONFIGURED if all vars are set, PARTIAL if some are set, OFF if none are set.
const FEATURE_GROUPS = [
  {
    tag: 'MCP / AGENT',
    label: 'MCP Token Exchange',
    vars: [
      { name: 'MCP_SERVER_URL',                              desc: 'WebSocket URL of the MCP server' },
      { name: 'PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID',       desc: 'MCP token exchanger client ID' },
      { name: 'PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_SECRET',   desc: 'MCP token exchanger client secret' },
      { name: 'PINGONE_RESOURCE_MCP_SERVER_URI',             desc: 'MCP server resource URI (aud)' },
    ],
  },
  {
    tag: 'HELIX LLM',
    label: 'Helix AI Agent',
    vars: [
      { name: 'HELIX_BASE_URL',           desc: 'Helix tenant base URL' },
      { name: 'HELIX_API_KEY',            desc: 'Helix agent-scoped API key' },
      { name: 'HELIX_ENVIRONMENT_ID',     desc: 'Helix environment / tenant ID' },
      { name: 'HELIX_AGENT_ID',           desc: 'Published Helix agent name' },
      { name: 'HELIX_PROMPT_FIELD_ID',    desc: 'AI Task input field ID in the agent' },
    ],
  },
  {
    tag: 'AUTHORIZE',
    label: 'PingOne Authorize',
    vars: [
      { name: 'PINGONE_AUTHORIZE_DECISION_ENDPOINT_ID',    desc: 'Authorize decision endpoint ID' },
      { name: 'PINGONE_AUTHORIZE_WORKER_CLIENT_ID',        desc: 'Authorize worker client ID' },
      { name: 'PINGONE_AUTHORIZE_WORKER_CLIENT_SECRET',    desc: 'Authorize worker client secret' },
    ],
  },
  {
    tag: 'MGMT API',
    label: 'PingOne Worker / Management API',
    vars: [
      { name: 'PINGONE_WORKER_TOKEN_CLIENT_ID',      desc: 'Worker app client ID' },
      { name: 'PINGONE_WORKER_TOKEN_CLIENT_SECRET',  desc: 'Worker app client secret' },
    ],
  },
  {
    tag: 'CIBA',
    label: 'Backchannel Auth (CIBA)',
    vars: [
      { name: 'CIBA_ENABLED', desc: 'Set to true to enable CIBA flows' },
    ],
  },
  {
    tag: 'OLLAMA',
    label: 'Ollama (local LLM)',
    vars: [
      { name: 'OLLAMA_BASE_URL', desc: 'Ollama server URL (default: http://localhost:11434)' },
      { name: 'OLLAMA_MODEL',    desc: 'Model name (e.g. mistral, llama3)' },
    ],
  },
];

function isSet(name) {
  const v = process.env[name];
  return typeof v === 'string' && v.trim() !== '';
}

function groupStatus(vars) {
  const setCount = vars.filter(v => isSet(v.name)).length;
  if (setCount === vars.length) return 'ok';
  if (setCount === 0) return 'off';
  return 'partial';
}

function checkEnv() {
  if (process.env.NODE_ENV === 'test') return { ok: true, missing: [] };

  const isProduction = process.env.NODE_ENV === 'production';

  const missing = REQUIRED.filter(v => !isSet(v.name));

  // ── Banner header ────────────────────────────────────────────────────────
  const line = '═'.repeat(66);
  console.log(`\n${CYAN}${BOLD}╔${line}╗${RESET}`);
  console.log(`${CYAN}${BOLD}║${RESET}${BOLD}          BANKING APP — STARTUP CONFIGURATION REPORT            ${RESET}${CYAN}${BOLD}║${RESET}`);
  console.log(`${CYAN}${BOLD}╚${line}╝${RESET}\n`);

  // ── Required vars ────────────────────────────────────────────────────────
  if (missing.length > 0) {
    console.log(`  ${RED}${BOLD}REQUIRED — missing (app will not work correctly):${RESET}`);
    missing.forEach(v => {
      console.log(`    ${RED}✗${RESET}  ${BOLD}${v.name.padEnd(38)}${RESET}${DIM}${v.desc}${RESET}`);
    });
    console.log('');
    if (isProduction) {
      console.log(`  ${RED}${BOLD}FATAL: Required env vars missing in production — exiting.${RESET}\n`);
      process.exit(1);
    } else {
      console.log(`  ${YELLOW}WARNING: Starting in development mode with missing required vars.${RESET}`);
      console.log(`  ${YELLOW}Some features will not work. See docs/setup-guide.md${RESET}\n`);
    }
  } else {
    const pub = process.env.PUBLIC_APP_URL;
    console.log(`  ${GREEN}✓${RESET}  ${BOLD}Core OAuth / PingOne${RESET}${' '.repeat(18)}${GREEN}configured${RESET}`);
    console.log(`      ${DIM}Admin redirect : ${pub}/api/auth/oauth/callback${RESET}`);
    console.log(`      ${DIM}User  redirect : ${pub}/api/auth/oauth/user/callback${RESET}`);
  }

  // ── Feature group table ───────────────────────────────────────────────────
  console.log('');
  FEATURE_GROUPS.forEach(group => {
    const status = groupStatus(group.vars);
    const tagPad = group.tag.padEnd(14);
    const labelPad = group.label.padEnd(34);

    if (status === 'ok') {
      console.log(`  ${GREEN}✓${RESET}  ${DIM}[${tagPad}]${RESET}  ${labelPad}${GREEN}configured${RESET}`);
    } else if (status === 'partial') {
      const unset = group.vars.filter(v => !isSet(v.name)).map(v => v.name);
      console.log(`  ${YELLOW}!${RESET}  ${DIM}[${tagPad}]${RESET}  ${labelPad}${YELLOW}partial${RESET}`);
      unset.forEach(name => {
        console.log(`      ${YELLOW}missing:${RESET} ${name}`);
      });
    } else {
      console.log(`  ${DIM}○  [${tagPad}]  ${labelPad}not configured${RESET}`);
    }
  });

  // ── Footer ────────────────────────────────────────────────────────────────
  console.log('');
  console.log(`  ${DIM}Setup guide : docs/SETUP.md${RESET}`);
  console.log(`  ${DIM}.env file   : banking_api_server/.env${RESET}`);
  console.log('');

  return { ok: missing.length === 0, missing };
}

const result = checkEnv();
module.exports = result;
