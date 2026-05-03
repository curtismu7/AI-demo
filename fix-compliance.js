const fs = require('fs');
let code = fs.readFileSync('banking_api_ui/src/services/agentFlowDiagramService.js', 'utf8');

// We need to add logic to update compliance steps when applyServerEvent fires
// or when completeMcpToolCall fires.

const patch = `
  applyServerEvent(payload) {
    if (!payload || typeof payload !== 'object') return;
    if (payload.phase === 'stream_end') {
      state.updatedAt = Date.now();
      emit();
      return;
    }
    
    // Auto-update compliance map
    const complianceMap = {
      'request_accepted': ['agent-token-init'],
      'resolving_access_token': ['agent-scope-aware-cache'],
      'access_token_ready': ['olb-resource-token'],
      'authorize_gate_begin': ['gw-scope-map'],
      'authorize_denied': ['gw-denial-metadata', 'bff-response-shape'],
      'authorize_permitted': ['gw-scope-map', 'agent-scope-aware-cache'],
      'mfa_challenge_initiated': ['gw-hitl-challenge-type', 'agent-error-propagation', 'agent-recovery-branch', 'ui-gateway-consent'],
      'mfa_challenge_completed': ['ui-auto-refire', 'agent-token-init'],
      'mcp_remote_done': ['claim-diagnostics']
    };

    if (complianceMap[payload.phase]) {
      complianceMap[payload.phase].forEach(id => {
        const step = state.complianceSteps.find(s => s.id === id);
        if (step) {
          step.status = 'done';
          state.complianceStep = id;
        }
      });
    }

    const label = PHASE_LABELS[payload.phase] || String(payload.phase);
`;

code = code.replace(/applyServerEvent\(payload\) \{\s*if \(\!payload \|\| typeof payload \!\=\= 'object'\) return;\s*if \(payload\.phase \=\=\= 'stream\_end'\) \{\s*state\.updatedAt \= Date\.now\(\);\s*emit\(\);\s*return;\s*\}\s*const label \= PHASE\_LABELS\[payload\.phase\] \|\| String\(payload\.phase\);/m, patch.trim());

fs.writeFileSync('banking_api_ui/src/services/agentFlowDiagramService.js', code);
