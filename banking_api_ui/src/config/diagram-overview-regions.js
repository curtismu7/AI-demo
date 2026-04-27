/**
 * diagram-overview-regions.js
 *
 * Region coordinate map for the Ping Identity Digital Assistants overview diagram.
 * Coordinates are PERCENTAGES of the image natural dimensions (0–100).
 * Update bounds after visually inspecting overview.png.
 *
 * Event categories must match EVENT_CATEGORIES in banking_api_server/services/appEventService.js:
 *   oauth, token_exchange, session, jwks, mcp, auth_lifecycle, agent,
 *   authorize, agent_prompt, delegation, introspection
 */
export const OVERVIEW_REGIONS = [
  {
    id: 'user',
    label: 'User',
    bounds: { xPct: 2, yPct: 35, wPct: 12, hPct: 30 },
    triggers: ['oauth', 'auth_lifecycle'],
    tags: [],
    keywords: ['user', 'customer', 'end user', 'authentication'],
  },
  {
    id: 'trust-boundary',
    label: 'Trust Boundary',
    bounds: { xPct: 14, yPct: 5, wPct: 3, hPct: 90 },
    triggers: ['oauth', 'auth_lifecycle'],
    tags: [],
    keywords: ['trust boundary', 'perimeter'],
  },
  {
    id: 'idp-oauth-as',
    label: 'IdP / OAuth AS (PingOne)',
    bounds: { xPct: 18, yPct: 5, wPct: 18, hPct: 25 },
    triggers: ['oauth', 'token_exchange', 'introspection'],
    tags: [],
    keywords: ['pingone', 'idp', 'oauth', 'authorization server', 'token exchange', 'token issuer'],
  },
  {
    id: 'pingauthorize',
    label: 'PingAuthorize',
    bounds: { xPct: 38, yPct: 5, wPct: 18, hPct: 25 },
    triggers: ['authorize'],
    tags: [],
    keywords: ['pingauthorize', 'authorize', 'policy', 'permit', 'deny', 'authorization'],
  },
  {
    id: 'agent',
    label: 'Agent (AI)',
    bounds: { xPct: 28, yPct: 38, wPct: 16, hPct: 25 },
    triggers: ['agent', 'agent_prompt'],
    tags: [],
    keywords: ['agent', 'llm', 'ai', 'assistant', 'langgraph'],
  },
  {
    id: 'mcp-gw',
    label: 'MCP Gateway',
    bounds: { xPct: 58, yPct: 30, wPct: 14, hPct: 18 },
    triggers: ['mcp', 'token_exchange'],
    tags: [],
    keywords: ['mcp gateway', 'mcp gw', 'gateway', 'mcp server'],
  },
  {
    id: 'api-gw',
    label: 'API Gateway',
    bounds: { xPct: 58, yPct: 52, wPct: 14, hPct: 18 },
    triggers: ['mcp'],
    tags: [],
    keywords: ['api gateway', 'api gw'],
  },
  {
    id: 'service-a',
    label: 'Backend Service A',
    bounds: { xPct: 76, yPct: 12, wPct: 10, hPct: 15 },
    triggers: ['agent_prompt'],
    tags: ['agent_prompt/heuristic_tool'],
    keywords: ['backend', 'service a', 'accounts', 'balance'],
  },
  {
    id: 'service-b',
    label: 'Backend Service B',
    bounds: { xPct: 76, yPct: 30, wPct: 10, hPct: 15 },
    triggers: ['agent_prompt'],
    tags: ['agent_prompt/heuristic_tool'],
    keywords: ['service b', 'transactions'],
  },
  {
    id: 'service-c',
    label: 'Backend Service C',
    bounds: { xPct: 76, yPct: 50, wPct: 10, hPct: 15 },
    triggers: ['agent_prompt'],
    tags: ['agent_prompt/heuristic_tool'],
    keywords: ['service c', 'investments'],
  },
  {
    id: 'service-d',
    label: 'Backend Service D',
    bounds: { xPct: 76, yPct: 70, wPct: 10, hPct: 15 },
    triggers: ['agent_prompt'],
    tags: ['agent_prompt/heuristic_tool'],
    keywords: ['service d'],
  },
];
