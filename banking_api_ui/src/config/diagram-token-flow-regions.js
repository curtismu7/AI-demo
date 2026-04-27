/**
 * diagram-token-flow-regions.js
 *
 * Region coordinate map for the detailed whiteboard token-flow diagram.
 * Coordinates are PERCENTAGES of the image natural dimensions (0–100).
 * Update bounds after visually inspecting token-flow.png.
 *
 * Covers: OLB Application, chatbot, agent1, LLM, PingOne AIC (Agent + Token Exc + Client Cred),
 * PingAuthorize, MCP Gateway, MCP OLB, MCP Invest, API, OAuth RS, and service boxes.
 */
export const TOKEN_FLOW_REGIONS = [
  {
    id: 'olb-application',
    label: 'OLB Application (BFF)',
    bounds: { xPct: 1, yPct: 25, wPct: 12, hPct: 20 },
    triggers: ['oauth', 'session'],
    tags: [],
    keywords: ['olb', 'bff', 'banking app', 'application'],
  },
  {
    id: 'chatbot',
    label: 'Chatbot (UI)',
    bounds: { xPct: 1, yPct: 50, wPct: 12, hPct: 15 },
    triggers: ['agent'],
    tags: ['agent/message'],
    keywords: ['chatbot', 'chat', 'user interface'],
  },
  {
    id: 'agent1',
    label: 'Agent (LangGraph)',
    bounds: { xPct: 16, yPct: 35, wPct: 12, hPct: 20 },
    triggers: ['agent_prompt'],
    tags: ['agent_prompt/llm_invoke', 'agent_prompt/heuristic_tool'],
    keywords: ['agent', 'langgraph', 'agent1'],
  },
  {
    id: 'llm',
    label: 'LLM (Claude / Anthropic)',
    bounds: { xPct: 16, yPct: 60, wPct: 12, hPct: 18 },
    triggers: ['agent_prompt'],
    tags: ['agent_prompt/llm_invoke', 'agent_prompt/llm_complete'],
    keywords: ['llm', 'claude', 'anthropic', 'language model'],
  },
  {
    id: 'pingone-aic',
    label: 'PingOne AIC',
    bounds: { xPct: 32, yPct: 10, wPct: 18, hPct: 30 },
    triggers: ['oauth', 'token_exchange', 'introspection'],
    tags: [],
    keywords: ['pingone', 'aic', 'authorization server', 'oauth as'],
  },
  {
    id: 'token-exchange-box',
    label: 'Token Exchange (RFC 8693)',
    bounds: { xPct: 34, yPct: 20, wPct: 12, hPct: 12 },
    triggers: ['token_exchange'],
    tags: ['token_exchange/rfc8693-success', 'token_exchange/rfc8693-error'],
    keywords: ['token exchange', 'rfc 8693', 'rfc8693', 'delegation'],
  },
  {
    id: 'pingauthorize-tf',
    label: 'PingAuthorize',
    bounds: { xPct: 32, yPct: 55, wPct: 18, hPct: 22 },
    triggers: ['authorize'],
    tags: [],
    keywords: ['pingauthorize', 'authorize', 'policy', 'permit', 'deny'],
  },
  {
    id: 'mcp-gateway-tf',
    label: 'MCP Gateway',
    bounds: { xPct: 54, yPct: 30, wPct: 12, hPct: 20 },
    triggers: ['mcp', 'token_exchange'],
    tags: [],
    keywords: ['mcp gateway', 'gateway', 'mcp gw'],
  },
  {
    id: 'mcp-olb',
    label: 'MCP OLB Server',
    bounds: { xPct: 70, yPct: 20, wPct: 12, hPct: 18 },
    triggers: ['mcp', 'agent_prompt'],
    tags: ['agent_prompt/heuristic_tool'],
    keywords: ['mcp olb', 'olb server', 'mcp server'],
  },
  {
    id: 'mcp-invest',
    label: 'MCP Invest Server',
    bounds: { xPct: 70, yPct: 45, wPct: 12, hPct: 18 },
    triggers: ['mcp', 'agent_prompt'],
    tags: ['agent_prompt/heuristic_tool'],
    keywords: ['mcp invest', 'invest server', 'investments'],
  },
  {
    id: 'oauth-rs',
    label: 'OAuth RS / Banking API',
    bounds: { xPct: 86, yPct: 30, wPct: 12, hPct: 35 },
    triggers: ['agent_prompt'],
    tags: ['agent_prompt/heuristic_tool'],
    keywords: ['resource server', 'banking api', 'oauth rs', 'rs'],
  },
];
