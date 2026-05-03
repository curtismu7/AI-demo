const fs = require('fs');
let js = fs.readFileSync('/Users/cmuir/P1Import-apps/Banking/banking_api_ui/src/components/AgentUiModeToggle.js', 'utf8');

js = js.replace(
`      <div className="agent-ui-mode-toggle__segmented" role="toolbar" aria-labelledby={\`\${idPrefix}-legend\`}>`,
`      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
        <div className="agent-ui-mode-toggle__segmented" role="toolbar" aria-labelledby={\`\${idPrefix}-legend\`}>`
);

js = js.replace(
`      {showFabCheckbox && (
        <label className="agent-ui-mode-toggle__fab">
          <input
            type="checkbox"
            checked={fab}
            onChange={(e) => void handleFabToggle(e)}
            aria-label="Also show floating FAB on dashboard routes"
          />
          <span>+ FAB</span>
        </label>
      )}`,
`      {placement !== 'none' && (
        <label className="agent-ui-mode-toggle__fab" style={{ marginLeft: '12px', display: 'flex', alignItems: 'center', whiteSpace: 'nowrap' }}>
          <input
            type="checkbox"
            checked={fab}
            onChange={(e) => void handleFabToggle(e)}
            aria-label="Always show float agent"
          />
          <span style={{ marginLeft: '6px', color: '#fff' }}>Always float</span>
        </label>
      )}
      </div>`
);

fs.writeFileSync('/Users/cmuir/P1Import-apps/Banking/banking_api_ui/src/components/AgentUiModeToggle.js', js);
