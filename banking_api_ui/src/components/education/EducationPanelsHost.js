// banking_api_ui/src/components/education/EducationPanelsHost.js
import React from 'react';
import { useEducationUI } from '../../context/EducationUIContext';
import { EDU } from './educationIds';
import LoginFlowPanel from './LoginFlowPanel';
import TokenExchangePanel from './TokenExchangePanel';
import MayActPanel from './MayActPanel';
import McpProtocolPanel from './McpProtocolPanel';
import IntrospectionPanel from './IntrospectionPanel';
import AgentGatewayPanel from './AgentGatewayPanel';
import RFCIndexPanel from './RFCIndexPanel';
import StepUpPanel from './StepUpPanel';
import PingOneAuthorizePanel from './PingOneAuthorizePanel';
import CimdPanel from './CimdPanel';
import HumanInLoopPanel from './HumanInLoopPanel';
import BestPracticesPanel from './BestPracticesPanel';

/**
 * Mounts all education drawers/modals; visibility controlled by EducationUIContext.
 */
export default function EducationPanelsHost() {
  const { panel, tab, close } = useEducationUI();

  return (
    <>
      <LoginFlowPanel isOpen={panel === EDU.LOGIN_FLOW} onClose={close} initialTabId={tab} />
      <TokenExchangePanel isOpen={panel === EDU.TOKEN_EXCHANGE} onClose={close} initialTabId={tab} />
      <MayActPanel isOpen={panel === EDU.MAY_ACT} onClose={close} initialTabId={tab} />
      <McpProtocolPanel isOpen={panel === EDU.MCP_PROTOCOL} onClose={close} initialTabId={tab} />
      <IntrospectionPanel isOpen={panel === EDU.INTROSPECTION} onClose={close} initialTabId={tab} />
      <AgentGatewayPanel isOpen={panel === EDU.AGENT_GATEWAY} onClose={close} initialTabId={tab} />
      <RFCIndexPanel isOpen={panel === EDU.RFC_INDEX} onClose={close} initialTabId={tab} />
      <StepUpPanel isOpen={panel === EDU.STEP_UP} onClose={close} initialTabId={tab} />
      <PingOneAuthorizePanel isOpen={panel === EDU.PINGONE_AUTHORIZE} onClose={close} initialTabId={tab} />
      <CimdPanel isOpen={panel === EDU.CIMD} onClose={close} initialTabId={tab} />
      <HumanInLoopPanel isOpen={panel === EDU.HUMAN_IN_LOOP} onClose={close} initialTabId={tab} />
      <BestPracticesPanel isOpen={panel === EDU.BEST_PRACTICES} onClose={close} initialTabId={tab} />
    </>
  );
}
