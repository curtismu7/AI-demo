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
  { id: 'cimd', label: 'OAuth: Client ID Metadata Doc (CIMD)', panel: EDU.CIMD, tab: 'what' },
];
