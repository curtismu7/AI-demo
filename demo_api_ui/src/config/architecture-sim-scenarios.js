/**
 * Pre-authored simulation scenarios for ArchitectureOverviewPage.
 *
 * Each scenario is an array of steps. When a step fires:
 *   - step.nodes  → set to "active" (amber pulse)
 *   - step.edges  → set to "active" (sweep animation)
 *   - Previous active nodes/edges are promoted to "done" (green)
 *
 * nodeId / edgeId values must match the `id` attributes in ArchitectureSimSvg.jsx.
 */

export const SCENARIOS = [
  {
    id: 'oauth-login',
    label: 'OAuth Login (PKCE)',
    steps: [
      { nodes: ['n-browser'],  edges: [],                    desc: 'User opens the app in the browser' },
      { nodes: ['n-bff'],      edges: ['e-browser-bff'],     desc: 'Browser → BFF: PKCE auth redirect begins (RFC 6749 §4.1 + RFC 7636)' },
      { nodes: ['n-pingone'],  edges: ['e-bff-pingone'],     desc: 'BFF exchanges auth code at PingOne token endpoint' },
      { nodes: ['n-bff'],      edges: [],                    desc: 'BFF receives access + ID tokens; sets httpOnly session cookie' },
      { nodes: ['n-browser'],  edges: ['e-browser-bff'],     desc: 'Session established — login complete ✅' },
    ],
  },
  {
    id: 'mcp-tool-call',
    label: 'MCP Tool Call',
    steps: [
      { nodes: ['n-browser'],     edges: [],                    desc: 'User triggers an AI tool call (e.g. "Get my accounts")' },
      { nodes: ['n-bff'],         edges: ['e-browser-bff'],     desc: 'BFF validates session; resolves user access token' },
      { nodes: ['n-mcp-gw'],      edges: ['e-bff-mcpgw'],       desc: 'BFF sends request to MCP Gateway with user token' },
      { nodes: ['n-pingone'],     edges: ['e-mcpgw-pingone'],   desc: 'Gateway performs RFC 8693 token exchange with PingOne' },
      { nodes: ['n-mcp-server'],  edges: ['e-mcpgw-mcpserver'], desc: 'Gateway forwards exchanged token to MCP Server; tool executes' },
      { nodes: ['n-bff'],         edges: [],                    desc: 'Tool result returns to BFF → browser' },
    ],
  },
  {
    id: 'token-exchange',
    label: 'RFC 8693 Token Exchange',
    steps: [
      { nodes: ['n-bff'],         edges: [],                    desc: 'BFF holds user access token (subject_token) from session' },
      { nodes: ['n-mcp-gw'],      edges: ['e-bff-mcpgw'],       desc: 'MCP Gateway receives request + user token' },
      { nodes: ['n-pingone'],     edges: ['e-mcpgw-pingone'],   desc: 'Token Exchange: subject_token → narrowed MCP-scoped token (new aud)' },
      { nodes: ['n-mcp-gw'],      edges: [],                    desc: 'Gateway holds narrowed token with MCP audience + delegated scopes' },
      { nodes: ['n-mcp-server'],  edges: ['e-mcpgw-mcpserver'], desc: 'Narrowed token forwarded to MCP Server — tool call authorised' },
    ],
  },
  {
    id: 'hitl-consent',
    label: 'HITL Consent Flow',
    steps: [
      { nodes: ['n-browser'],  edges: [],                desc: 'User initiates high-value transfer (> threshold)' },
      { nodes: ['n-bff'],      edges: ['e-browser-bff'], desc: 'BFF detects amount ≥ threshold; triggers HITL challenge (428)' },
      { nodes: ['n-hitl'],     edges: ['e-bff-hitl'],    desc: 'HITL Service sends out-of-band consent request (push/email)' },
      { nodes: ['n-bff'],      edges: [],                desc: 'BFF polls HITL Service for approval decision' },
      { nodes: ['n-bff'],      edges: ['e-bff-hitl'],    desc: 'Approval received — transaction proceeds through normal gate' },
      { nodes: ['n-browser'],  edges: ['e-browser-bff'], desc: 'Transfer complete — confirmation returned to browser ✅' },
    ],
  },
  {
    id: 'step-up-mfa',
    label: 'Step-Up MFA',
    steps: [
      { nodes: ['n-browser'],       edges: [],                  desc: 'User attempts large transfer' },
      { nodes: ['n-bff'],           edges: ['e-browser-bff'],   desc: 'BFF Step-Up Gate: amount ≥ threshold → 428 step_up_required' },
      { nodes: ['n-pingone'],       edges: ['e-bff-pingone'],   desc: 'Browser redirected to PingOne for MFA challenge' },
      { nodes: ['n-bff'],           edges: ['e-bff-pingone'],   desc: 'BFF validates step-up token; ACR value confirmed' },
      { nodes: ['n-pingauthorize'], edges: ['e-bff-pingauth'],  desc: 'PingAuthorize evaluates transfer policy → PERMIT' },
      { nodes: ['n-browser'],       edges: ['e-browser-bff'],   desc: 'Transfer authorised — response returned ✅' },
    ],
  },
  {
    id: 'path-a-api-key',
    label: 'MCP Gateway Path A (API Key)',
    steps: [
      { nodes: ['n-bff'],           edges: [],                    desc: 'BFF selects Path A: api_key disposition' },
      { nodes: ['n-mcp-gw'],        edges: ['e-bff-mcpgw'],       desc: 'MCP Gateway receives request; drops RFC 6750 Bearer token' },
      { nodes: ['n-mcp-gw'],        edges: [],                    desc: 'Gateway injects X-API-Key + X-User-Sub headers' },
      { nodes: ['n-mortgage'],      edges: ['e-mcpgw-mortgage'],  desc: 'Request forwarded to Mortgage Service (:8082) with API key auth' },
    ],
  },
  {
    id: 'path-b-dual-token',
    label: 'MCP Gateway Path B (Dual Token)',
    steps: [
      { nodes: ['n-bff'],              edges: [],                        desc: 'BFF selects Path B: dual_token disposition' },
      { nodes: ['n-mcp-gw'],           edges: ['e-bff-mcpgw'],           desc: 'MCP Gateway forwards Bearer + id_token to Resource Server' },
      { nodes: ['n-resource-server'],  edges: ['e-mcpgw-resourceserver'], desc: 'Resource Server validates Bearer (RFC 6750) + id_token (OIDC Core §3.1.3.7)' },
    ],
  },
  {
    id: 'path-c-oauth-bearer',
    label: 'MCP Gateway Path C (OAuth Bearer)',
    steps: [
      { nodes: ['n-bff'],              edges: [],                        desc: 'BFF selects Path C: oauth_bearer disposition' },
      { nodes: ['n-mcp-gw'],           edges: ['e-bff-mcpgw'],           desc: 'MCP Gateway performs RFC 8693 exchange; new token has Resource Server aud' },
      { nodes: ['n-pingone'],          edges: ['e-mcpgw-pingone'],       desc: 'Token Exchange: narrowed Bearer for Resource Server audience' },
      { nodes: ['n-resource-server'],  edges: ['e-mcpgw-resourceserver'], desc: 'Exchanged Bearer forwarded to /accounts or /transactions endpoint ✅' },
    ],
  },
];

export const SCENARIO_MAP = Object.fromEntries(SCENARIOS.map(s => [s.id, s]));
export const DEFAULT_SCENARIO_ID = 'oauth-login';
