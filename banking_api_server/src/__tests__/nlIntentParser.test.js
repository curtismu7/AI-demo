const { parseHeuristic } = require('../../services/nlIntentParser');

// ── Helpers ───────────────────────────────────────────────────────────────────

function edu(msg) {
  const r = parseHeuristic(msg);
  expect(r.kind).toBe('education');
  return r;
}

function bank(msg) {
  const r = parseHeuristic(msg);
  expect(r.kind).toBe('banking');
  return r;
}

// ── Banking intent ────────────────────────────────────────────────────────────

describe('nlIntentParser — banking intents', () => {
  it('routes "show my accounts" → accounts', () => {
    expect(bank('show my accounts').banking.action).toBe('accounts');
  });

  it('routes "list all accounts" → accounts', () => {
    expect(bank('list all accounts').banking.action).toBe('accounts');
  });

  it('routes "transaction history" → transactions', () => {
    expect(bank('transaction history').banking.action).toBe('transactions');
  });

  it('routes "recent activity" → transactions', () => {
    expect(bank('recent activity').banking.action).toBe('transactions');
  });

  it('routes "transfer money" → transfer', () => {
    expect(bank('transfer money to savings').banking.action).toBe('transfer');
  });

  it('routes "deposit funds" → deposit', () => {
    expect(bank('deposit funds').banking.action).toBe('deposit');
  });

  it('routes "withdraw cash" → withdraw', () => {
    expect(bank('withdraw cash').banking.action).toBe('withdraw');
  });
});

// ── Education intents: CIBA ───────────────────────────────────────────────────

describe('nlIntentParser — CIBA education', () => {
  it('routes "explain ciba" → ciba: true', () => {
    const r = edu('explain ciba');
    expect(r.ciba).toBe(true);
  });

  it('routes "backchannel authentication" → ciba: true', () => {
    const r = edu('backchannel authentication');
    expect(r.ciba).toBe(true);
  });

  it('routes "out of band approval" → ciba: true', () => {
    const r = edu('out of band approval');
    expect(r.ciba).toBe(true);
  });

  it('routes "push auth" → ciba: true', () => {
    const r = edu('push auth example');
    expect(r.ciba).toBe(true);
  });
});

// ── Education intents: Token Exchange ─────────────────────────────────────────

describe('nlIntentParser — token exchange education', () => {
  it('routes "what is token exchange" → token-exchange panel', () => {
    expect(edu('what is token exchange').education.panel).toBe('token-exchange');
  });

  it('routes "rfc 8693" keyword → token-exchange panel', () => {
    expect(edu('explain rfc 8693').education.panel).toBe('token-exchange');
  });

  it('routes "delegate token" → token-exchange panel', () => {
    expect(edu('delegate token to agent').education.panel).toBe('token-exchange');
  });
});

// ── Education intents: CIMD (new) ─────────────────────────────────────────────

describe('nlIntentParser — CIMD education', () => {
  it('routes "cimd" → cimd panel', () => {
    expect(edu('what is cimd').education.panel).toBe('cimd');
    expect(edu('what is cimd').education.tab).toBe('what');
  });

  it('routes "client id metadata" → cimd panel', () => {
    expect(edu('client id metadata document').education.panel).toBe('cimd');
  });

  it('routes "client metadata document" → cimd panel', () => {
    expect(edu('explain the client metadata document').education.panel).toBe('cimd');
  });

  it('routes "dynamic client" → cimd panel', () => {
    expect(edu('what is dynamic client registration').education.panel).toBe('cimd');
  });

  it('routes "dcr" keyword → cimd panel', () => {
    expect(edu('how does dcr work').education.panel).toBe('cimd');
  });

  it('routes "rfc 7591" → rfc-index (rfc-index check fires before cimd)', () => {
    // The rfc-index check `/\b(rfc)\b/` matches before the cimd check; use 'dcr' to target cimd
    expect(edu('what is rfc 7591').education.panel).toBe('rfc-index');
  });

  it('routes "register client" → cimd panel', () => {
    expect(edu('how do I register client').education.panel).toBe('cimd');
  });

  it('routes "self register" → cimd panel', () => {
    expect(edu('self register a client').education.panel).toBe('cimd');
  });
});

// ── Education intents: may_act ────────────────────────────────────────────────

describe('nlIntentParser — may_act education', () => {
  it('routes "may_act claim" → may-act panel', () => {
    expect(edu('explain may_act claim').education.panel).toBe('may-act');
  });

  it('routes "act claim" → may-act panel', () => {
    expect(edu('what is the act claim').education.panel).toBe('may-act');
  });

  it('routes "delegation claim" → may-act panel', () => {
    expect(edu('delegation claim in JWT').education.panel).toBe('may-act');
  });
});

// ── Education intents: PKCE / Login Flow ──────────────────────────────────────

describe('nlIntentParser — PKCE / login flow education', () => {
  it('routes "pkce" → login-flow panel, tab pkce', () => {
    const r = edu('what is pkce');
    expect(r.education.panel).toBe('login-flow');
    expect(r.education.tab).toBe('pkce');
  });

  it('routes "code verifier" → login-flow panel, tab pkce', () => {
    const r = edu('code verifier and code challenge');
    expect(r.education.panel).toBe('login-flow');
    expect(r.education.tab).toBe('pkce');
  });

  it('routes "login flow" → login-flow panel', () => {
    expect(edu('explain the login flow').education.panel).toBe('login-flow');
  });

  it('routes "authorization code" → login-flow panel', () => {
    expect(edu('how does authorization code flow work').education.panel).toBe('login-flow');
  });
});

// ── Education intents: step-up ────────────────────────────────────────────────

describe('nlIntentParser — step-up education', () => {
  it('routes "step-up" → step-up panel', () => {
    expect(edu('what is step up auth').education.panel).toBe('step-up');
  });

  it('routes "step up" (space) → step-up panel', () => {
    expect(edu('explain step up mfa').education.panel).toBe('step-up');
  });

  it('routes "acr" → step-up panel', () => {
    expect(edu('what does acr value do').education.panel).toBe('step-up');
  });
});

// ── Education intents: introspection ─────────────────────────────────────────

describe('nlIntentParser — introspection education', () => {
  it('routes "introspect" → introspection panel', () => {
    // regex matches `introspect` at word boundary; `introspection` would not match
    expect(edu('explain introspect endpoint').education.panel).toBe('introspection');
  });

  it('routes "7662" → introspection panel', () => {
    expect(edu('rfc 7662').education.panel).toBe('introspection');
  });
});

// ── Education intents: MCP protocol ──────────────────────────────────────────

describe('nlIntentParser — MCP protocol education', () => {
  it('routes "mcp" → mcp-protocol panel', () => {
    expect(edu('what is mcp').education.panel).toBe('mcp-protocol');
  });

  it('routes "model context" → mcp-protocol panel', () => {
    expect(edu('explain model context protocol').education.panel).toBe('mcp-protocol');
  });

  it('routes "json-rpc" → mcp-protocol panel', () => {
    expect(edu('how does json-rpc work in mcp').education.panel).toBe('mcp-protocol');
  });
});

// ── Education intents: agent gateway ─────────────────────────────────────────

describe('nlIntentParser — agent gateway education', () => {
  it('routes "agent gateway" → agent-gateway panel', () => {
    expect(edu('what is the agent gateway').education.panel).toBe('agent-gateway');
  });

  it('routes "resource indicator" → agent-gateway panel', () => {
    expect(edu('resource indicator rfc').education.panel).toBe('agent-gateway');
  });

  it('routes "rfc 8707" → agent-gateway panel', () => {
    expect(edu('explain rfc 8707').education.panel).toBe('agent-gateway');
  });
});

// ── Education intents: PingOne Authorize ─────────────────────────────────────

describe('nlIntentParser — PingOne Authorize education', () => {
  it('routes "pingone authorize" → pingone-authorize panel', () => {
    expect(edu('what is pingone authorize').education.panel).toBe('pingone-authorize');
  });

  it('routes "pdp" → pingone-authorize panel', () => {
    expect(edu('how does the pdp work').education.panel).toBe('pingone-authorize');
  });
});

// ── Fallback / no match ───────────────────────────────────────────────────────

describe('nlIntentParser — fallback', () => {
  it('returns kind none for unrecognised input', () => {
    const r = parseHeuristic('the weather is nice today');
    expect(r.kind).toBe('none');
  });

  it('returns kind none for empty string', () => {
    const r = parseHeuristic('');
    expect(r.kind).toBe('none');
  });

  it('returns kind none for whitespace only', () => {
    const r = parseHeuristic('   ');
    expect(r.kind).toBe('none');
  });

  it('includes a prompt message in fallback', () => {
    const r = parseHeuristic('random unrelated text xyz');
    expect(typeof r.message).toBe('string');
    expect(r.message.length).toBeGreaterThan(0);
  });
});

