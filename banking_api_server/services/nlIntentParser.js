// banking_api_server/services/nlIntentParser.js
/**
 * Heuristic NL → education panel or banking action (no external LLM).
 * Keeps the Banking Agent useful without API keys (MasterFlow-style UX, zero-cost path).
 */
'use strict';

const EDU = {
  LOGIN_FLOW: 'login-flow',
  TOKEN_EXCHANGE: 'token-exchange',
  MAY_ACT: 'may-act',
  MCP_PROTOCOL: 'mcp-protocol',
  INTROSPECTION: 'introspection',
  AGENT_GATEWAY: 'agent-gateway',
  RFC_INDEX: 'rfc-index',
  STEP_UP: 'step-up',
  PINGONE_AUTHORIZE: 'pingone-authorize',
  CIMD: 'cimd',
  HUMAN_IN_LOOP: 'human-in-loop',
};

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^\w\s/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @returns {{ source: 'heuristic', result: object }}
 */
function parseEducation(t) {
  if (/\b(ciba|backchannel|push auth|out of band|oob)\b/.test(t)) {
    return { kind: 'education', ciba: true, tab: 'what' };
  }
  if (
    /\b(human[- ]in[- ]the[- ]loop|human[- ]in[- ]the[- ]middle|hitl|high[- ]value consent|agent consent|consent.*\bagent\b)\b/.test(t)
  ) {
    return { kind: 'education', education: { panel: EDU.HUMAN_IN_LOOP, tab: 'what' } };
  }
  if (/\b(token exchange|rfc\s*8693|8693|delegate.*token|user token.*mcp token|transaction token)\b/.test(t)) {
    return { kind: 'education', education: { panel: EDU.TOKEN_EXCHANGE, tab: 'why' } };
  }
  if (/\b(may_act|may act|act claim|delegation claim)\b/.test(t)) {
    return { kind: 'education', education: { panel: EDU.MAY_ACT, tab: 'what' } };
  }
  if (/\b(pkce|code verifier|code challenge)\b/.test(t)) {
    return { kind: 'education', education: { panel: EDU.LOGIN_FLOW, tab: 'pkce' } };
  }
  if (/\b(login flow|authorization code|sign in flow|oauth flow)\b/.test(t)) {
    return { kind: 'education', education: { panel: EDU.LOGIN_FLOW, tab: 'what' } };
  }
  if (/\b(mcp|model context|tools\/list|json-rpc)\b/.test(t) && !/\b(list|show|get)\b/.test(t)) {
    return { kind: 'education', education: { panel: EDU.MCP_PROTOCOL, tab: 'what' } };
  }
  if (/\b(introspect|7662|rfc 7662)\b/.test(t)) {
    return { kind: 'education', education: { panel: EDU.INTROSPECTION, tab: 'why' } };
  }
  if (/\b(agent gateway|resource indicator|8707|9728|rfc 8707)\b/.test(t)) {
    return { kind: 'education', education: { panel: EDU.AGENT_GATEWAY, tab: 'overview' } };
  }
  if (/\b(rfc|spec index|standards)\b/.test(t)) {
    return { kind: 'education', education: { panel: EDU.RFC_INDEX, tab: 'index' } };
  }
  if (/\b(step[- ]?up|mfa threshold|acr)\b/.test(t)) {
    return { kind: 'education', education: { panel: EDU.STEP_UP, tab: 'what' } };
  }
  if (/\b(pingone authorize|authorize policy|pdp)\b/.test(t)) {
    return { kind: 'education', education: { panel: EDU.PINGONE_AUTHORIZE, tab: 'what' } };
  }
  if (/\b(cimd|client.?id.?metadata|client metadata document|self.?register|register client|dynamic client|dcr|rfc.?7591)\b/.test(t)) {
    return { kind: 'education', education: { panel: EDU.CIMD, tab: 'what' } };
  }
  return null;
}

/**
 * @returns {{ kind: 'banking', banking: { action: string, params?: object } } | null}
 */
function parseBanking(t) {
  if (/\b(list|show|get|what).*(mcp.*tools?|tools?.*available|available.*tools?)\b|\btools?\s*(list|available)\b/.test(t)) {
    return { kind: 'banking', banking: { action: 'mcp_tools' } };
  }
  if (/\b(show|list|get|see).*(account|balances?)\b|\bmy accounts\b|\ball accounts\b/.test(t)) {
    return { kind: 'banking', banking: { action: 'accounts' } };
  }
  if (/\b(transaction|history|activity|recent)\b/.test(t)) {
    return { kind: 'banking', banking: { action: 'transactions' } };
  }
  // Balance: explicit account id, or phrases like "my balance", "current balance", "check balance"
  if (/\bbalance\b/.test(t)) {
    const m = t.match(/acc[_a-z0-9-]{6,}/i);
    if (m) return { kind: 'banking', banking: { action: 'balance', params: { accountId: m[0] } } };
    if (
      /\b(account|acc|checking|savings)\b/.test(t) ||
      /\b(my|the|current|check|what|show|get)\b.*\bbalance\b/.test(t) ||
      /\bbalance\b.*\b(my|current)\b/.test(t)
    ) {
      return { kind: 'banking', banking: { action: 'balance' } };
    }
  }
  if (/\btransfer\b/.test(t)) {
    const amountMatch = t.match(/\$?\s*(\d+(?:\.\d+)?)/);
    const fromMatch   = t.match(/\bfrom\s+((?:my\s+|the\s+|primary\s+)?(?:checking|savings|chk|sav)(?:\s+account)?)/i);
    const toMatch     = t.match(/\bto\s+((?:my\s+|the\s+|primary\s+)?(?:checking|savings|chk|sav)(?:\s+account)?)/i);
    const clean = (s) => s && s.replace(/^(my|the|primary)\s+/i, '').replace(/\s+account$/i, '').trim();
    const params = {
      ...(amountMatch && { amount: parseFloat(amountMatch[1]) }),
      ...(fromMatch   && { fromId: clean(fromMatch[1]) }),
      ...(toMatch     && { toId:   clean(toMatch[1]) }),
    };
    return { kind: 'banking', banking: { action: 'transfer', params } };
  }
  if (/\bdeposit\b/.test(t)) {
    const amountMatch = t.match(/\$?\s*(\d+(?:\.\d+)?)/);
    const toMatch     = t.match(/\b(?:to|into)\s+((?:my\s+|the\s+)?(?:checking|savings|chk|sav)(?:\s+account)?)/i);
    const clean = (s) => s && s.replace(/^(my|the)\s+/i, '').replace(/\s+account$/i, '').trim();
    const params = {
      ...(amountMatch && { amount: parseFloat(amountMatch[1]) }),
      ...(toMatch     && { toId:   clean(toMatch[1]) }),
    };
    return { kind: 'banking', banking: { action: 'deposit', params } };
  }
  if (/\b(withdraw|withdrawal)\b/.test(t)) {
    const amountMatch = t.match(/\$?\s*(\d+(?:\.\d+)?)/);
    const fromMatch   = t.match(/\b(?:from)\s+((?:my\s+|the\s+)?(?:checking|savings|chk|sav)(?:\s+account)?)/i);
    const clean = (s) => s && s.replace(/^(my|the)\s+/i, '').replace(/\s+account$/i, '').trim();
    const params = {
      ...(amountMatch && { amount: parseFloat(amountMatch[1]) }),
      ...(fromMatch   && { fromId: clean(fromMatch[1]) }),
    };
    return { kind: 'banking', banking: { action: 'withdraw', params } };
  }
  if (/\b(logout|log out|sign out|signout)\b/.test(t)) {
    return { kind: 'banking', banking: { action: 'logout' } };
  }
  // Web search: general queries not related to banking or OAuth education
  if (
    /\b(search|find info|look up|look up|what is|tell me about|who is)\b/i.test(t) &&
    !/\b(account|balance|transaction|transfer|deposit|withdraw|mcp|rfc|oauth|token|ciba|pkce|scope|login|oidc)\b/i.test(t)
  ) {
    return { kind: 'banking', banking: { action: 'web_search', query: message } };
  }
  return null;
}

function parseHeuristic(message) {
  const t = norm(message);
  if (!t) {
    return { kind: 'none', message: 'Say what you want to do or which topic to learn.' };
  }

  // Hard fast-path: "list/show/get mcp tools" is ALWAYS a banking action, never education.
  // Runs before the what-is/explain guard and before parseEducation so that phrases like
  // "list of mcp tools" are never swallowed by the broad \bmcp\b education regex.
  if (/\b(list|show|get|what).*(mcp.*tools?|tools?.*available|available.*tools?)\b|\btools?\s*(list|available)\b/.test(t)) {
    return { kind: 'banking', banking: { action: 'mcp_tools' } };
  }

  // Prefer education if user explicitly asks to explain / learn
  if (/\b(what is|how does|explain|learn about|show me (the )?(doc|guide|topic))\b/.test(t)) {
    const edu = parseEducation(t);
    if (edu) return edu;
  }

  const bank = parseBanking(t);
  if (bank) return bank;

  const edu2 = parseEducation(t);
  if (edu2) return edu2;

  return {
    kind: 'none',
    message:
      'Try: “show my accounts”, “recent transactions”, “explain token exchange”, or “what is CIBA”.',
  };
}

module.exports = {
  parseHeuristic,
  EDU,
};
