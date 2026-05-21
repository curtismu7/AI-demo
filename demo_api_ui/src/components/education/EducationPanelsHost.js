// banking_api_ui/src/components/education/EducationPanelsHost.js
import React from "react";
import { useEducationUI } from "../../context/EducationUIContext";
import { EDU } from "./educationIds";
import LoginFlowPanel from "./LoginFlowPanel";
import TokenExchangePanel from "./TokenExchangePanel";
import MayActPanel from "./MayActPanel";
import McpProtocolPanel from "./McpProtocolPanel";
import IntrospectionPanel from "./IntrospectionPanel";
import AgentGatewayPanel from "./AgentGatewayPanel";
import RFCIndexPanel from "./RFCIndexPanel";
import StepUpPanel from "./StepUpPanel";
import PingOneAuthorizePanel from "./PingOneAuthorizePanel";
import CimdPanel from "./CimdPanel";
import ComputerUseAgentPanel from "./ComputerUseAgentPanel";
import HumanInLoopPanel from "./HumanInLoopPanel";
import BestPracticesPanel from "./BestPracticesPanel";
import PARPanel from "./PARPanel";
import RARPanel from "./RARPanel";
import JwtClientAuthPanel from "./JwtClientAuthPanel";
import AgenticMaturityPanel from "./AgenticMaturityPanel";
import Oidc21Panel from "./Oidc21Panel";
import LangChainPanel from "./LangChainPanel";
import AgentBuilderLandscapePanel from "./AgentBuilderLandscapePanel";
import LlmLandscapePanel from "./LlmLandscapePanel";
import AiPlatformLandscapePanel from "./AiPlatformLandscapePanel";
import SensitiveDataPanel from "./SensitiveDataPanel";
import PingGatewayMcpPanel from "./PingGatewayMcpPanel";
import ArchitectureDiagramPanel from "./ArchitectureDiagramPanel";
import TokenChainEducationPanel from "./TokenChainEducationPanel";
import RFC8693Panel from "./RFC8693Panel";
import FlowDiagramsPanel from "./FlowDiagramsPanel";
import IETFStandardsPanel from "./IETFStandardsPanel";
import TokenFlowPanel from "./TokenFlowPanel";
import AiPrimerPanel from "./AiPrimerPanel";
import IdJagPanel from "./IdJagPanel";
import GleanPanel from "./GleanPanel";
import IntentDelegationPanel from "./IntentDelegationPanel";
import AuthZenPanel from "./AuthZenPanel";
import WebMcpEduPanel from "./WebMcpEduPanel";
import ElicitationPanel from "./ElicitationPanel";
import AgentRestrictionsPanel from "./AgentRestrictionsPanel";
import TransactionTokensPanel from "./TransactionTokensPanel";

const PANEL_MAP = {
  [EDU.LOGIN_FLOW]: LoginFlowPanel,
  [EDU.TOKEN_EXCHANGE]: TokenExchangePanel,
  [EDU.MAY_ACT]: MayActPanel,
  [EDU.MCP_PROTOCOL]: McpProtocolPanel,
  [EDU.INTROSPECTION]: IntrospectionPanel,
  [EDU.AGENT_GATEWAY]: AgentGatewayPanel,
  [EDU.RFC_INDEX]: RFCIndexPanel,
  [EDU.STEP_UP]: StepUpPanel,
  [EDU.PINGONE_AUTHORIZE]: PingOneAuthorizePanel,
  [EDU.CIMD]: CimdPanel,
  [EDU.CUA]: ComputerUseAgentPanel,
  [EDU.HUMAN_IN_LOOP]: HumanInLoopPanel,
  [EDU.BEST_PRACTICES]: BestPracticesPanel,
  [EDU.PAR]: PARPanel,
  [EDU.RAR]: RARPanel,
  [EDU.JWT_CLIENT_AUTH]: JwtClientAuthPanel,
  [EDU.AGENTIC_MATURITY]: AgenticMaturityPanel,
  [EDU.OIDC_21]: Oidc21Panel,
  [EDU.LANGCHAIN]: LangChainPanel,
  [EDU.AGENT_BUILDER_LANDSCAPE]: AgentBuilderLandscapePanel,
  [EDU.LLM_LANDSCAPE]: LlmLandscapePanel,
  [EDU.AI_PLATFORM_LANDSCAPE]: AiPlatformLandscapePanel,
  [EDU.SENSITIVE_DATA]: SensitiveDataPanel,
  [EDU.PINGGATEWAY_MCP]: PingGatewayMcpPanel,
  [EDU.ARCHITECTURE_DIAGRAM]: ArchitectureDiagramPanel,
  [EDU.TOKEN_CHAIN]: TokenChainEducationPanel,
  [EDU.RFC_8693]: RFC8693Panel,
  [EDU.FLOW_DIAGRAMS]: FlowDiagramsPanel,
  [EDU.IETF_STANDARDS]: IETFStandardsPanel,
  [EDU.TOKEN_FLOW]: TokenFlowPanel,
  [EDU.AI_PRIMER]: AiPrimerPanel,
  [EDU.ID_JAG]: IdJagPanel,
  [EDU.GLEAN]: GleanPanel,
  [EDU.INTENT_DELEGATION]: IntentDelegationPanel,
  [EDU.AUTHZEN]: AuthZenPanel,
  [EDU.WEB_MCP]: WebMcpEduPanel,
  [EDU.MCP_ELICITATION]: ElicitationPanel,
  [EDU.AGENT_RESTRICTIONS]: AgentRestrictionsPanel,
  [EDU.TRANSACTION_TOKENS]: TransactionTokensPanel,
};

export default function EducationPanelsHost() {
  const { panel, tab, close } = useEducationUI();
  const ActivePanel = panel ? PANEL_MAP[panel] : null;
  if (!ActivePanel) return null;
  return <ActivePanel isOpen onClose={close} initialTabId={tab} />;
}
