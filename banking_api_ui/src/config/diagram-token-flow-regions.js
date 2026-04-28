/**
 * diagram-token-flow-regions.js
 *
 * Region coordinate map for the whiteboard token-flow diagram.
 * Coordinates are PERCENTAGES (0–100), used as-is in viewBox="0 0 100 100".
 *
 * Tune bounds visually: zoom into the diagram and adjust xPct/yPct/wPct/hPct
 * until the highlight box tightly wraps each component.
 */
export const TOKEN_FLOW_REGIONS = [
  {
    id: 'olb-application',
    label: 'OLB Application (BFF)',
    bounds: { xPct: 1, yPct: 28, wPct: 8, hPct: 12 },
    triggers: ['oauth', 'session'],
    tags: [],
    keywords: ['olb', 'bff', 'banking app', 'application'],
  },
  {
    id: 'chatbot',
    label: 'Chatbot (UI)',
    bounds: { xPct: 1, yPct: 52, wPct: 8, hPct: 10 },
    triggers: ['agent'],
    tags: ['agent/message'],
    keywords: ['chatbot', 'chat', 'user interface'],
  },
  {
    id: 'agent1',
    label: 'Agent (LangGraph)',
    bounds: { xPct: 16, yPct: 37, wPct: 9, hPct: 13 },
    triggers: ['agent_prompt'],
    tags: ['agent_prompt/llm_invoke', 'agent_prompt/heuristic_tool'],
    keywords: ['agent', 'langgraph', 'agent1'],
  },
  {
    id: 'llm',
    label: 'LLM (Claude)',
    bounds: { xPct: 16, yPct: 62, wPct: 9, hPct: 11 },
    triggers: ['agent_prompt'],
    tags: ['agent_prompt/llm_invoke', 'agent_prompt/llm_complete'],
    keywords: ['llm', 'claude', 'anthropic', 'language model'],
  },
  {
    id: 'pingone-aic',
    label: 'PingOne AIC',
    bounds: { xPct: 32, yPct: 8, wPct: 14, hPct: 22 },
    triggers: ['oauth', 'token_exchange', 'introspection'],
    tags: [],
    keywords: ['pingone', 'aic', 'authorization server', 'oauth as'],
  },
  {
    id: 'token-exchange-box',
    label: 'RFC 8693 Token Exchange',
    bounds: { xPct: 34, yPct: 18, wPct: 10, hPct: 8 },
    triggers: ['token_exchange'],
    tags: ['token_exchange/rfc8693-success', 'token_exchange/rfc8693-error'],
    keywords: ['token exchange', 'rfc 8693', 'rfc8693', 'delegation'],
  },
  {
    id: 'pingauthorize-tf',
    label: 'PingAuthorize',
    bounds: { xPct: 32, yPct: 57, wPct: 14, hPct: 14 },
    triggers: ['authorize'],
    tags: [],
    keywords: ['pingauthorize', 'authorize', 'policy', 'permit', 'deny'],
  },
  {
    id: 'mcp-gateway-tf',
    label: 'MCP Gateway',
    bounds: { xPct: 54, yPct: 32, wPct: 9, hPct: 13 },
    triggers: ['mcp', 'token_exchange'],
    tags: [],
    keywords: ['mcp gateway', 'gateway', 'mcp gw'],
  },
  {
    id: 'mcp-olb',
    label: 'MCP OLB Server',
    bounds: { xPct: 70, yPct: 22, wPct: 9, hPct: 11 },
    triggers: ['mcp', 'agent_prompt'],
    tags: ['agent_prompt/heuristic_tool'],
    keywords: ['mcp olb', 'olb server', 'mcp server'],
  },
  {
    id: 'mcp-invest',
    label: 'MCP Invest Server',
    bounds: { xPct: 70, yPct: 47, wPct: 9, hPct: 11 },
    triggers: ['mcp', 'agent_prompt'],
    tags: ['agent_prompt/heuristic_tool'],
    keywords: ['mcp invest', 'invest server', 'investments'],
  },
  {
    id: 'oauth-rs',
    label: 'OAuth RS / Banking API',
    bounds: { xPct: 86, yPct: 32, wPct: 9, hPct: 22 },
    triggers: ['agent_prompt'],
    tags: ['agent_prompt/heuristic_tool'],
    keywords: ['resource server', 'banking api', 'oauth rs', 'rs'],
  },
];
