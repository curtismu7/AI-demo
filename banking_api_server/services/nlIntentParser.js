// banking_api_server/services/nlIntentParser.js
/**
 * Heuristic NL → education panel or banking action (no external LLM).
 * Keeps the Banking Agent useful without API keys (MasterFlow-style UX, zero-cost path).
 */
'use strict';

const EDU = {
  // existing — keep exactly as-is
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
  CUA: 'cua',
  HUMAN_IN_LOOP: 'human-in-loop',
  // new for Phase 231 — values verified against educationIds.js
  BEST_PRACTICES: 'best-practices',
  PAR: 'par',
  RAR: 'rar',
  JWT_CLIENT_AUTH: 'jwt-client-auth',
  AGENTIC_MATURITY: 'agentic-maturity',
  OIDC_21: 'oidc-21',
  LANGCHAIN: 'langchain',
  AGENT_BUILDER_LANDSCAPE: 'agent-builder-landscape',
  LLM_LANDSCAPE: 'llm-landscape',
  SENSITIVE_DATA: 'sensitive-data',
  AI_PLATFORM_LANDSCAPE: 'ai-platform-landscape',
  PINGGATEWAY_MCP: 'pinggateway-mcp',
  ARCHITECTURE_DIAGRAM: 'architecture-diagram',
  TOKEN_CHAIN: 'token-chain',
  RFC_8693: 'rfc-8693',
  FLOW_DIAGRAMS: 'flow-diagrams',
  IETF_STANDARDS: 'ietf-standards',
  TOKEN_FLOW: 'token-flow',
  AI_PRIMER: 'ai-primer',
  ID_JAG: 'id-jag',
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
  if (/\b(step[- ]?up|mfa threshold|acr)\b/.test(t)) {
    return { kind: 'education', education: { panel: EDU.STEP_UP, tab: 'what' } };
  }
  if (/\b(pingone authorize|authorize policy|pdp)\b/.test(t)) {
    return { kind: 'education', education: { panel: EDU.PINGONE_AUTHORIZE, tab: 'what' } };
  }
  if (/\b(cimd|client.?id.?metadata|client metadata document|self.?register|register client|dynamic client|dcr|rfc.?7591)\b/.test(t)) {
    return { kind: 'education', education: { panel: EDU.CIMD, tab: 'what' } };
  }
  if (/\b(cua|computer use agent|computer use)\b/.test(t)) {
    return { kind: 'education', education: { panel: EDU.CUA, tab: 'what' } };
  }
  if (/\b(langchain|lang chain|lcel|llm orchestrat|multi.?provider.*llm|model.?agnostic.*llm)\b/.test(t)) {
    return { kind: 'education', education: { panel: EDU.LANGCHAIN, tab: 'overview' } };
  }
  // Token Chain (covers: "🔗 Token Chain", "🔗 Token Chain: JWT Claims", "🔗 Token Chain: Exchange Paths")
  if (/\b(token[- ]chain)\b/.test(t)) {
    return { kind: 'education', education: { panel: EDU.TOKEN_CHAIN, tab: 'overview' } };
  }
  // AI Best Practices (covers: "⭐ AI Agent Best Practices")
  if (/\b(best[- ]practices|ai[- ]agent[- ]best)\b/.test(t)) {
    return { kind: 'education', education: { panel: EDU.BEST_PRACTICES, tab: 'overview' } };
  }
  // Agentic Maturity Model (covers: "⭐ Agentic Maturity Model")
  if (/\b(agentic[- ]maturity|maturity[- ]model)\b/.test(t)) {
    return { kind: 'education', education: { panel: EDU.AGENTIC_MATURITY, tab: 'overview' } };
  }
  // PAR — Pushed Authorization Requests (covers: "PAR (RFC 9126)")
  if (/\b(par\b|rfc[- ]?9126|pushed[- ]authorization)/.test(t)) {
    return { kind: 'education', education: { panel: EDU.PAR, tab: 'what' } };
  }
  // RAR — Rich Authorization Requests (covers: "RAR (RFC 9396)", "🔒 Selective Disclosure: RAR / RFC 9396")
  if (/\b(rar\b|rfc[- ]?9396|rich[- ]authorization)/.test(t)) {
    return { kind: 'education', education: { panel: EDU.RAR, tab: 'what' } };
  }
  // JWT Client Authentication (covers: "JWT client auth (RFC 7523)")
  if (/\b(jwt[- ]client[- ]auth|rfc[- ]?7523)\b/.test(t)) {
    return { kind: 'education', education: { panel: EDU.JWT_CLIENT_AUTH, tab: 'what' } };
  }
  // LLM Landscape / Comparison / How LLMs Work
  if (/\b(llm[- ]landscape|llm[- ]comparison|how[- ]llms?[- ]work)\b/.test(t)) {
    return { kind: 'education', education: { panel: EDU.LLM_LANDSCAPE, tab: 'commercial' } };
  }
  // Agent Builder Landscape / Comparison
  if (/\b(agent[- ]builder|agent[- ]framework[- ]landscape)\b/.test(t)) {
    return { kind: 'education', education: { panel: EDU.AGENT_BUILDER_LANDSCAPE, tab: 'langchain' } };
  }
  // AI Platform Landscape / Comparison
  if (/\b(ai[- ]platform[- ]landscape|ai[- ]platform[- ]comparison)\b/.test(t)) {
    return { kind: 'education', education: { panel: EDU.AI_PLATFORM_LANDSCAPE, tab: 'overview' } };
  }
  // Sensitive Data & Selective Disclosure
  if (/\b(sensitive[- ]data|selective[- ]disclosure)\b/.test(t)) {
    return { kind: 'education', education: { panel: EDU.SENSITIVE_DATA, tab: 'overview' } };
  }
  // PingGateway MCP Security
  if (/\b(pinggateway|ping[- ]gateway)\b/.test(t)) {
    return { kind: 'education', education: { panel: EDU.PINGGATEWAY_MCP, tab: 'overview' } };
  }
  // Architecture Diagrams (covers: "🏗️ C4 Architecture Diagram", "🏗️ BFF Component Diagram")
  if (/\b(c4[- ]architecture|architecture[- ]diagram|bff[- ]component)\b/.test(t)) {
    return { kind: 'education', education: { panel: EDU.ARCHITECTURE_DIAGRAM, tab: 'context' } };
  }
  // IETF Standards for Agentic Identity
  if (/\b(ietf[- ]standards|agentic[- ]identity|rfc7523bis)\b/.test(t)) {
    return { kind: 'education', education: { panel: EDU.IETF_STANDARDS, tab: 'overview' } };
  }
  // AI Primer
  if (/\b(ai[- ]primer)\b/.test(t)) {
    return { kind: 'education', education: { panel: EDU.AI_PRIMER, tab: 'overview' } };
  }
  // ID-JAG / Cross-App Access (XAA)
  if (/\b(id[- ]jag|cross[- ]app[- ]access|xaa)\b/.test(t)) {
    return { kind: 'education', education: { panel: EDU.ID_JAG, tab: 'overview' } };
  }
  // Step-up: deviceAuthentications API sub-topic
  if (/\b(device[- ]authentications?|deviceauthentications)\b/.test(t)) {
    return { kind: 'education', education: { panel: EDU.STEP_UP, tab: 'device' } };
  }
  // Authorize sub-topics: policy & AI/MCP security, MCP PingOne & env
  if (/\b(authorize[- ]policy|ai.?mcp[- ]security|mcp[- ]pingone)\b/.test(t)) {
    return { kind: 'education', education: { panel: EDU.PINGONE_AUTHORIZE, tab: 'policy' } };
  }
  // Agent request flow diagram
  if (/\b(agent[- ]request[- ]flow|agent[- ]flow[- ]diagram)\b/.test(t)) {
    return { kind: 'education', education: { panel: EDU.FLOW_DIAGRAMS, tab: 'agent-flow' } };
  }
  // OIDC 2.1 (norm() strips the dot so "oidc 2.1" → "oidc 2 1")
  if (/\b(oidc[- ]?2[\s.]?1|oidc 2 1|openid[- ]connect[- ]2)\b/.test(t)) {
    return { kind: 'education', education: { panel: EDU.OIDC_21, tab: 'overview' } };
  }
  // RFC 8693 Token Exchange (explicit RFC reference)
  if (/\b(rfc[- ]?8693)\b/.test(t)) {
    return { kind: 'education', education: { panel: EDU.TOKEN_EXCHANGE, tab: 'overview' } };
  }
  // Token Flow — end-to-end 2-exchange delegation
  if (/\b(token[- ]flow|2[- ]exchange[- ]flow)\b/.test(t)) {
    return { kind: 'education', education: { panel: EDU.TOKEN_FLOW, tab: 'overview' } };
  }
  // Broad RFC / standards fallback — must come after all specific RFC rules above
  if (/\b(rfc|spec index|standards)\b/.test(t)) {
    return { kind: 'education', education: { panel: EDU.RFC_INDEX, tab: 'index' } };
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
  // Sensitive details first — must precede general accounts check
  if (/\b(sensitive account details|full account|routing number|account number|account details)\b/.test(t)) {
    return { kind: 'banking', banking: { action: 'sensitive_account_details' } };
  }
  // Balance: explicit account id, or phrases like "my balance", "current balance", "check balance" — MUST precede accounts check
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
  // Accounts: show/list/get/what accounts
  if (/\b(what|show|list|get|see|view|pull|display).*(accounts?)\b|\bmy accounts?\b(?!\s+balance)|\ball\b.*\baccounts?\b|\bcustomer accounts?\b/.test(t)) {
    return { kind: 'banking', banking: { action: 'accounts' } };
  }
  if (/\b(biggest|largest|highest|top)\b.*(purchase|spend|transaction|payment)\b|\b(purchase|spend|transaction|payment).*(biggest|largest|highest)\b|\bmost expensive\b|\bspent the most\b|\bbiggest spend\b/.test(t)) {
    return { kind: 'banking', banking: { action: 'biggest_purchase' } };
  }
  if (/\b(spending summary|total spend|how much.*(spend|spent)|where.*money|breakdown.*spend|spend.*breakdown)\b/.test(t)) {
    return { kind: 'banking', banking: { action: 'spending_summary' } };
  }
  if (/\b(transaction|history|activity|recent)\b/.test(t)) {
    return { kind: 'banking', banking: { action: 'transactions' } };
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
    return { kind: 'banking', banking: { action: 'web_search', query: t } };
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
