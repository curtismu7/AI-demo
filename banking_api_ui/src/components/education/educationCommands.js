// banking_api_ui/src/components/education/educationCommands.js
// Single source for Learn topics (Education bar + Banking Agent).
import { EDU } from './educationIds';

/** @typedef {{ id: string, label: string, panel?: string, tab?: string, ciba?: boolean }} EducationCommand */

/** @type {EducationCommand[]} */
export const EDUCATION_COMMANDS = [
  { id: 'oauth-pkce', label: 'OAuth: Authorization Code + PKCE', panel: EDU.LOGIN_FLOW, tab: 'what' },
  { id: 'oauth-ciba', label: 'OAuth: CIBA (backchannel)', ciba: true },
  { id: 'oauth-tx', label: 'OAuth: Token exchange (RFC 8693)', panel: EDU.TOKEN_EXCHANGE, tab: 'why' },
  { id: 'pkce', label: 'PKCE deep dive', panel: EDU.LOGIN_FLOW, tab: 'pkce' },
  { id: 'may-act', label: 'may_act / act claims', panel: EDU.MAY_ACT, tab: 'what' },
  { id: 'mcp', label: 'MCP protocol', panel: EDU.MCP_PROTOCOL, tab: 'what' },
  { id: 'introspect', label: 'Token introspection (RFC 7662)', panel: EDU.INTROSPECTION, tab: 'why' },
  { id: 'gateway', label: 'Agent Gateway (8707 / 9728)', panel: EDU.AGENT_GATEWAY, tab: 'overview' },
  { id: 'rfc', label: 'RFC & spec index', panel: EDU.RFC_INDEX, tab: 'index' },
  { id: 'step-up', label: 'Step-up MFA', panel: EDU.STEP_UP, tab: 'what' },
  { id: 'authorize', label: 'PingOne Authorize', panel: EDU.PINGONE_AUTHORIZE, tab: 'what' },
  { id: 'authorize-policy-mcp', label: 'Authorize: policy & AI/MCP security', panel: EDU.PINGONE_AUTHORIZE, tab: 'policy-mcp' },
  { id: 'authorize-mcp-config', label: 'Authorize: MCP PingOne & env', panel: EDU.PINGONE_AUTHORIZE, tab: 'mcp-config' },
  { id: 'cimd', label: 'OAuth: Client ID Metadata Doc (CIMD)', panel: EDU.CIMD, tab: 'what' },
  { id: 'human-in-loop', label: 'Human-in-the-loop (agent)', panel: EDU.HUMAN_IN_LOOP, tab: 'what' },
  { id: 'best-practices', label: '⭐ AI Agent Best Practices', panel: EDU.BEST_PRACTICES, tab: 'overview' },
  { id: 'par', label: 'PAR (RFC 9126)', panel: EDU.PAR, tab: 'what' },
  { id: 'rar', label: 'RAR (RFC 9396)', panel: EDU.RAR, tab: 'what' },
  { id: 'jwt-client-auth', label: 'JWT client auth (RFC 7523)', panel: EDU.JWT_CLIENT_AUTH, tab: 'what' },
  { id: 'agentic-maturity', label: '⭐ Agentic Maturity Model', panel: EDU.AGENTIC_MATURITY, tab: 'overview' },
  { id: 'langchain', label: '🔗 LangChain — LCEL + multi-provider', panel: EDU.LANGCHAIN, tab: 'overview' },
  { id: 'agent-builders', label: '🤖 Agent Builder Landscape', panel: EDU.AGENT_BUILDER_LANDSCAPE, tab: 'langchain' },
  { id: 'agent-builder-compare', label: '📊 Agent Builder Comparison', panel: EDU.AGENT_BUILDER_LANDSCAPE, tab: 'comparison' },
  { id: 'llm-landscape', label: '🧠 LLM Landscape', panel: EDU.LLM_LANDSCAPE, tab: 'commercial' },
  { id: 'how-llms-work', label: '⚙️ How LLMs Work', panel: EDU.LLM_LANDSCAPE, tab: 'howllmswork' },
  { id: 'llm-compare', label: '📊 LLM Comparison', panel: EDU.LLM_LANDSCAPE, tab: 'comparison' },
];
