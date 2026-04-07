/**
 * Startup environment variable validator.
 * Checks for required vars and warns on missing optional ones.
 * Exits non-zero in production if any required var is missing.
 * Skipped entirely in test environments.
 *
 * Usage: require('./scripts/check-env') near top of server.js.
 */

const REQUIRED = [
  { name: 'PINGONE_ENVIRONMENT_ID',   desc: 'PingOne tenant environment UUID' },
  { name: 'PINGONE_ADMIN_CLIENT_ID',  desc: 'Admin OAuth app client ID' },
  { name: 'PINGONE_ADMIN_CLIENT_SECRET', desc: 'Admin OAuth app client secret' },
  { name: 'PINGONE_USER_CLIENT_ID',   desc: 'User OAuth app client ID' },
  { name: 'PINGONE_USER_CLIENT_SECRET',  desc: 'User OAuth app client secret' },
  { name: 'SESSION_SECRET',           desc: 'Express session signing secret (min 32 chars)' },
  { name: 'PUBLIC_APP_URL',           desc: 'BFF public origin — drives OAuth redirect URIs (e.g. http://localhost:3001 or https://banking-demo-puce.vercel.app)' },
];

const RECOMMENDED = [
  { name: 'GROQ_API_KEY',       desc: 'Groq LLM key for natural language agent (falls back to keyword parser)' },
  { name: 'KV_REST_API_URL',    desc: 'Upstash Redis URL for persistent session store on Vercel' },
  { name: 'KV_REST_API_TOKEN',  desc: 'Upstash Redis token for persistent session store on Vercel' },
];

function checkEnv() {
  if (process.env.NODE_ENV === 'test') return { ok: true, missing: [] };

  const isProduction = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;

  const missing = REQUIRED.filter(v => !process.env[v.name] || process.env[v.name].trim() === '');
  const missingRecommended = RECOMMENDED.filter(v => !process.env[v.name] || process.env[v.name].trim() === '');

  if (missing.length > 0) {
    console.error('\n❌  Missing required environment variables:\n');
    missing.forEach(v => {
      console.error(`  ${v.name.padEnd(36)} — ${v.desc}`);
    });
    console.error('\n  Run: cp .env.example .env  and fill in the values above.');
    console.error('  Docs: https://github.com/your-org/banking#configuration\n');

    if (isProduction) {
      console.error('FATAL: Required env vars missing in production — exiting.\n');
      process.exit(1);
    } else {
      console.warn('WARNING: Starting in development mode with missing env vars — some features may not work.\n');
    }
  }

  if (missingRecommended.length > 0 && !isProduction) {
    console.warn('⚠️   Optional env vars not set (non-fatal):');
    missingRecommended.forEach(v => {
      console.warn(`  ${v.name.padEnd(36)} — ${v.desc}`);
    });
    console.warn('');
  }

  if (missing.length === 0) {
    const pub = process.env.PUBLIC_APP_URL;
    const adminRedirect = `${pub}/api/auth/oauth/callback`;
    const userRedirect  = `${pub}/api/auth/oauth/user/callback`;
    console.log(`[check-env] ✅  All required env vars present`);
    console.log(`[check-env]     PUBLIC_APP_URL     = ${pub}`);
    console.log(`[check-env]     Admin redirect URI = ${adminRedirect}`);
    console.log(`[check-env]     User  redirect URI = ${userRedirect}`);
  }

  return { ok: missing.length === 0, missing };
}

const result = checkEnv();
module.exports = result;
