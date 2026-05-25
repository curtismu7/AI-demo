import React, { useState, useEffect, useCallback } from 'react';
import bffAxios from '../services/bffAxios';
import { listMcpTools } from '../services/webMcpClient';
import '../styles/rule-panel.css';

// ---------------------------------------------------------------------------
// Badge config
// ---------------------------------------------------------------------------
const BADGE_STYLES = {
  CONSENT:  { background: '#dcfce7', color: '#166534' },
  'STEP-UP': { background: '#fef9c3', color: '#854d0e' },
  DENY:     { background: '#fee2e2', color: '#991b1b' },
  GATE:     { background: '#dbeafe', color: '#1e40af' },
  HITL:     { background: '#f3e8ff', color: '#6b21a8' },
  PERMIT:   { background: '#dcfce7', color: '#166534' },
};

const NO_VALUE = '—';

function Badge({ type }) {
  const style = BADGE_STYLES[type] || { background: '#f3f4f6', color: '#374151' };
  return (
    <span style={{
      display: 'inline-block',
      fontSize: '10px',
      fontWeight: 600,
      padding: '2px 7px',
      borderRadius: '10px',
      ...style,
    }}>
      {type}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Build rule list from config response
// ---------------------------------------------------------------------------
function buildRules(config) {
  const sim = config?.simulated || {};
  const flags = config?.flags || {};
  const txRules = [];
  const mcpRules = [];

  txRules.push({
    id: 'confirm',
    name: 'Confirm threshold',
    desc: `Transactions at or above $${sim.confirmAmount ?? 250} require the user to provide explicit consent before proceeding.`,
    badge: 'CONSENT',
    chips: {
      outcome: 'CONSENT',
      value: `$${sim.confirmAmount ?? 250}`,
      scope: 'All types',
    },
    testType: 'transaction',
  });

  txRules.push({
    id: 'stepup',
    name: 'Step-up threshold',
    desc: `Transactions at or above $${sim.stepUpAmount ?? 500} require the user to complete MFA (step-up authentication) before proceeding.`,
    badge: 'STEP-UP',
    chips: {
      outcome: 'STEP-UP',
      value: `$${sim.stepUpAmount ?? 500}`,
      scope: 'All types',
    },
    testType: 'transaction',
  });

  txRules.push({
    id: 'deny',
    name: 'Deny threshold',
    desc: `Transactions above $${sim.denyAmount ?? 2000} are hard-denied — no override or step-up will permit them.`,
    badge: 'DENY',
    chips: {
      outcome: 'DENY',
      value: `$${sim.denyAmount ?? 2000}`,
      scope: 'All types',
    },
    testType: 'transaction',
  });

  if (sim.consentTypes) {
    txRules.push({
      id: 'consent-types',
      name: 'Transfer type rule',
      desc: `The following transaction types always require consent regardless of amount: ${sim.consentTypes}.`,
      badge: 'CONSENT',
      chips: {
        outcome: 'CONSENT',
        value: NO_VALUE,
        scope: sim.consentTypes,
      },
      testType: 'transaction',
    });
  }

  if (sim.stepUpTypes) {
    txRules.push({
      id: 'stepup-types',
      name: 'Step-up type rule',
      desc: `The following transaction types always require MFA regardless of amount: ${sim.stepUpTypes}.`,
      badge: 'STEP-UP',
      chips: {
        outcome: 'STEP-UP',
        value: NO_VALUE,
        scope: sim.stepUpTypes,
      },
      testType: 'transaction',
    });
  }

  if (flags.ff_authorize_mcp_first_tool) {
    mcpRules.push({
      id: 'mcp-gate',
      name: 'MCP First Tool Gate',
      desc: 'The authorization policy is evaluated on the first MCP tool call per session. Subsequent tool calls in the same session are not re-evaluated unless the session changes.',
      badge: 'GATE',
      chips: {
        outcome: 'GATE',
        value: NO_VALUE,
        scope: 'First call / session',
      },
      testType: 'mcp',
    });
  }

  const denyCount = (sim.mcpDenyTools || []).length;
  mcpRules.push({
    id: 'mcp-deny',
    name: 'Denied tools',
    desc: denyCount === 0
      ? 'No MCP tools are currently explicitly denied. Any tool not otherwise gated will be permitted.'
      : `The following MCP tools are explicitly denied: ${(sim.mcpDenyTools || []).join(', ')}.`,
    badge: 'DENY',
    chips: {
      outcome: 'DENY',
      value: `${denyCount} tool${denyCount !== 1 ? 's' : ''}`,
      scope: denyCount === 0 ? 'None configured' : (sim.mcpDenyTools || []).join(', '),
    },
    testType: 'mcp',
  });

  const hitlCount = (sim.mcpHitlTools || []).length;
  mcpRules.push({
    id: 'mcp-hitl',
    name: 'HITL tools',
    desc: hitlCount === 0
      ? 'No MCP tools currently require human-in-the-loop approval.'
      : `The following MCP tools require human approval before execution: ${(sim.mcpHitlTools || []).join(', ')}.`,
    badge: 'HITL',
    chips: {
      outcome: 'HITL',
      value: `${hitlCount} tool${hitlCount !== 1 ? 's' : ''}`,
      scope: hitlCount === 0 ? 'None configured' : (sim.mcpHitlTools || []).join(', '),
    },
    testType: 'mcp',
  });

  return { txRules, mcpRules };
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function AuthorizeRulesPanel() {
  const [config, setConfig] = useState(null);
  const [configError, setConfigError] = useState(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [selectedRuleId, setSelectedRuleId] = useState(null);

  const [testAmount, setTestAmount] = useState('');
  const [testType, setTestType] = useState('deposit');
  const [testAcr, setTestAcr] = useState('');
  const [testTool, setTestTool] = useState('');
  const [testRunning, setTestRunning] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testError, setTestError] = useState(null);

  const [mcpTools, setMcpTools] = useState([]);

  useEffect(() => {
    listMcpTools()
      .then(data => setMcpTools((data.tools || []).map(t => t.name)))
      .catch(() => {}); // silent — fallback shows text input
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setConfigLoading(true);
      setConfigError(null);
      try {
        const res = await bffAxios.get('/api/authorize/rules');
        if (!cancelled) {
          setConfig(res.data);
          setConfigLoading(false);
        }
      } catch (err) {
        if (cancelled) return;
        setConfigError(err.response?.data?.message || 'Failed to load authorize rules');
        setConfigLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (config && !selectedRuleId) {
      const { txRules } = buildRules(config);
      if (txRules.length > 0) setSelectedRuleId(txRules[0].id);
    }
  }, [config, selectedRuleId]);

  const handleRunTest = useCallback(async (rule) => {
    setTestRunning(true);
    setTestResult(null);
    setTestError(null);
    try {
      if (rule.testType === 'mcp') {
        setTestResult({
          decision: rule.id === 'mcp-deny' ? 'DENY' : rule.id === 'mcp-hitl' ? 'HITL' : 'GATE',
          note: testTool
            ? `Tool "${testTool}" is ${(config?.simulated?.mcpDenyTools || []).includes(testTool)
                ? 'in the deny list — DENIED'
                : (config?.simulated?.mcpHitlTools || []).includes(testTool)
                  ? 'in the HITL list — requires human approval'
                  : 'not in any deny/HITL list — PERMITTED'}`
            : 'Enter a tool name above to check it against the deny and HITL lists.',
        });
      } else {
        const res = await bffAxios.post('/api/authorize/test-evaluate', {
          amount: parseFloat(testAmount) || 0,
          type: testType || 'deposit',
          acr: testAcr || undefined,
        });
        setTestResult(res.data);
      }
    } catch (err) {
      setTestError(err.response?.data?.error || err.message || 'Evaluation failed');
    } finally {
      setTestRunning(false);
    }
  }, [testAmount, testType, testAcr, testTool, config]);

  const rules = config ? buildRules(config) : { txRules: [], mcpRules: [] };
  const allRules = [...rules.txRules, ...rules.mcpRules];
  const selectedRule = allRules.find(r => r.id === selectedRuleId) || null;
  const activeEngine = config?.activeEngine || 'unknown';

  return (
    <div className="rp-container">
      <div className="rp-header">
        <h3 className="rp-header__title">Authorize Rules</h3>
        <p className="rp-header__sub">
          Browse the active authorization policy rules and test transactions against the engine.
        </p>
      </div>

      <div className="rp-body">
        <RuleList
          loading={configLoading}
          error={configError}
          txRules={rules.txRules}
          mcpRules={rules.mcpRules}
          selectedRuleId={selectedRuleId}
          onSelect={(id) => {
            setSelectedRuleId(id);
            setTestResult(null);
            setTestError(null);
          }}
        />
        <RuleDetail
          rule={selectedRule}
          activeEngine={activeEngine}
          mcpTools={mcpTools}
          testAmount={testAmount}
          setTestAmount={setTestAmount}
          testType={testType}
          setTestType={setTestType}
          testAcr={testAcr}
          setTestAcr={setTestAcr}
          testTool={testTool}
          setTestTool={setTestTool}
          testRunning={testRunning}
          testResult={testResult}
          testError={testError}
          onRunTest={() => selectedRule && handleRunTest(selectedRule)}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RuleList
// ---------------------------------------------------------------------------
function RuleList({ loading, error, txRules, mcpRules, selectedRuleId, onSelect }) {
  if (loading) {
    return (
      <div className="rp-list">
        {[1,2,3,4,5].map(i => (
          <div key={i} style={{ padding: '10px 12px', borderBottom: '1px solid #f3f3f3' }}>
            <div style={{ height: '12px', background: '#f3f3f3', borderRadius: '4px', marginBottom: '6px', width: '70%' }} />
            <div style={{ height: '10px', background: '#f3f3f3', borderRadius: '4px', width: '90%' }} />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rp-list" style={{ padding: '16px 12px' }}>
        <p style={{ fontSize: '12px', color: '#dc2626' }}>❌ {error}</p>
      </div>
    );
  }

  return (
    <div className="rp-list">
      <div className="rp-list-group-header">Transaction Rules</div>
      {txRules.map(rule => (
        <RuleCard key={rule.id} rule={rule} selected={rule.id === selectedRuleId} onSelect={onSelect} />
      ))}
      <div className="rp-list-group-header" style={{ marginTop: '4px' }}>MCP Tool Rules</div>
      {mcpRules.map(rule => (
        <RuleCard key={rule.id} rule={rule} selected={rule.id === selectedRuleId} onSelect={onSelect} />
      ))}
    </div>
  );
}

function RuleCard({ rule, selected, onSelect }) {
  return (
    <div
      onClick={() => onSelect(rule.id)}
      className={`rp-list-item${selected ? ' rp-list-item--active' : ''}`}
    >
      <div className="rp-list-item__name">{rule.name}</div>
      <div className="rp-list-item__sub">{rule.chips.value !== NO_VALUE ? rule.chips.value : rule.chips.scope}</div>
      <Badge type={rule.badge} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// RuleDetail
// ---------------------------------------------------------------------------
function RuleDetail({
  rule, activeEngine,
  mcpTools,
  testAmount, setTestAmount, testType, setTestType,
  testAcr, setTestAcr, testTool, setTestTool,
  testRunning, testResult, testError, onRunTest,
}) {
  const isMcp = rule?.testType === 'mcp';

  const engineNote = () => {
    if (activeEngine === 'pingone') return 'Active engine: PingOne Authorize. Test evaluations call the live decision endpoint.';
    if (activeEngine === 'simulated') return 'Active engine: Simulated. Configure a PingOne Authorize decision endpoint in the Authorize tab to switch to live policy evaluation.';
    return 'PingOne Authorize is enabled but not fully configured — falling back to simulated engine.';
  };

  const resultDisplay = () => {
    if (testError) return <span style={{ color: '#dc2626' }}>❌ {testError}</span>;
    if (!testResult) return null;
    if (testResult.note) return <span style={{ color: '#374151' }}>{testResult.note}</span>;
    const decision = testResult.stepUpRequired ? 'STEP-UP' : testResult.consentRequired ? 'CONSENT' : testResult.decision;
    const style = BADGE_STYLES[decision] || BADGE_STYLES.PERMIT;
    return (
      <span style={{ ...style, padding: '5px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 600 }}>
        {decision === 'PERMIT' ? '✅' : decision === 'DENY' ? '❌' : '⚠️'} {decision}
        {testResult.path ? ` — ${testResult.path}` : ''}
      </span>
    );
  };

  return (
    <div className="rp-detail">
      {!rule && (
        <p style={{ color: '#999', fontSize: '13px' }}>Select a rule from the list.</p>
      )}

      {rule && (
        <>
          <div className="rp-detail__title">{rule.name}</div>
          <div className="rp-detail__desc">{rule.desc}</div>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            {[
              { label: 'Engine', value: activeEngine === 'pingone' ? 'PingOne' : activeEngine === 'simulated' ? 'Simulated' : 'Unknown', color: activeEngine === 'pingone' ? '#2563eb' : activeEngine === 'simulated' ? '#16a34a' : '#6b7280' },
              { label: 'Outcome', value: rule.chips.outcome, color: (BADGE_STYLES[rule.chips.outcome] || {}).color || '#111' },
              { label: isMcp ? 'Tools' : 'Threshold', value: rule.chips.value, color: '#111' },
              { label: 'Scope', value: rule.chips.scope, color: '#111' },
            ].map(chip => (
              <div key={chip.label} style={{ flex: 1, background: '#f5f5f5', border: '1px solid #e5e5e5', borderRadius: '7px', padding: '8px 10px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '3px' }}>{chip.label}</div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: chip.color }}>{chip.value}</div>
              </div>
            ))}
          </div>

          {(() => {
            const resultNode = resultDisplay();
            return (
              <TestForm
                isMcp={isMcp}
                mcpTools={mcpTools}
                testAmount={testAmount} setTestAmount={setTestAmount}
                testType={testType} setTestType={setTestType}
                testAcr={testAcr} setTestAcr={setTestAcr}
                testTool={testTool} setTestTool={setTestTool}
                testRunning={testRunning}
                onRunTest={onRunTest}
                resultDisplay={resultNode}
              />
            );
          })()}

          <EngineNote note={engineNote()} />
        </>
      )}
    </div>
  );
}

function TestForm({ isMcp, mcpTools, testAmount, setTestAmount, testType, setTestType, testAcr, setTestAcr, testTool, setTestTool, testRunning, onRunTest, resultDisplay }) {
  return (
    <div className="rp-test-form">
      <div className="rp-test-form__heading">Test this rule</div>

      {isMcp ? (
        <div style={{ marginBottom: '10px' }}>
          <label className="rp-test-form__label">Tool name</label>
          {mcpTools.length > 0 ? (
            <select className="rp-test-form__input" value={testTool} onChange={e => setTestTool(e.target.value)}>
              <option value="">— select a tool —</option>
              {mcpTools.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          ) : (
            <input className="rp-test-form__input" value={testTool} onChange={e => setTestTool(e.target.value)} placeholder="e.g. get_account_balance" />
          )}
        </div>
      ) : (
        <div className="rp-test-form__row">
          <div className="rp-test-form__field">
            <label className="rp-test-form__label">Amount (USD)</label>
            <input className="rp-test-form__input" type="number" value={testAmount} onChange={e => setTestAmount(e.target.value)} placeholder="e.g. 300" />
          </div>
          <div className="rp-test-form__field">
            <label className="rp-test-form__label">Transaction type</label>
            <select className="rp-test-form__input" value={testType} onChange={e => setTestType(e.target.value)}>
              <option value="deposit">deposit</option>
              <option value="withdrawal">withdrawal</option>
              <option value="transfer">transfer</option>
            </select>
          </div>
          <div className="rp-test-form__field">
            <label className="rp-test-form__label">ACR</label>
            <select className="rp-test-form__input" value={testAcr} onChange={e => setTestAcr(e.target.value)}>
              <option value="">(none)</option>
              <option value="MFA">MFA</option>
              <option value="Single">Single</option>
            </select>
          </div>
        </div>
      )}

      <div className="rp-test-form__actions">
        <button
          className="rp-btn-primary"
          onClick={onRunTest}
          disabled={testRunning}
        >
          {testRunning ? 'Evaluating…' : 'Run evaluation'}
        </button>
        {resultDisplay}
      </div>
    </div>
  );
}

function EngineNote({ note }) {
  return (
    <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '9px 12px', fontSize: '11px', color: '#1e40af', lineHeight: 1.5 }}>
      <strong style={{ color: '#1e3a8a' }}>Engine: </strong>{note}
    </div>
  );
}
