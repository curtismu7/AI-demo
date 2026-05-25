import React, { useState, useEffect, useCallback } from 'react';
import bffAxios from '../services/bffAxios';

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
function buildRules(config, evalStatus) {
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
        value: '—',
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
        value: '—',
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
        value: '—',
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
  const [evalStatus, setEvalStatus] = useState(null);
  const [configError, setConfigError] = useState(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [adminFallback, setAdminFallback] = useState(false);
  const [selectedRuleId, setSelectedRuleId] = useState(null);

  const [testAmount, setTestAmount] = useState('');
  const [testType, setTestType] = useState('deposit');
  const [testAcr, setTestAcr] = useState('');
  const [testTool, setTestTool] = useState('');
  const [testRunning, setTestRunning] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testError, setTestError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setConfigLoading(true);
      setConfigError(null);

      let status = null;
      try {
        const res = await bffAxios.get('/api/authorize/evaluation-status');
        if (!cancelled) status = res.data;
      } catch {
        // non-fatal
      }

      try {
        const res = await bffAxios.get('/api/admin/authorize/config');
        if (!cancelled) {
          setConfig(res.data);
          setEvalStatus(status);
          setAdminFallback(false);
          setConfigLoading(false);
        }
      } catch (err) {
        if (cancelled) return;
        const status4xx = err.response?.status;
        if (status4xx === 401 || status4xx === 403) {
          setAdminFallback(true);
        } else {
          setConfigError(err.response?.data?.message || 'Failed to load authorize config');
        }
        setEvalStatus(status);
        setConfigLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (config && !selectedRuleId) {
      const { txRules } = buildRules(config, evalStatus);
      if (txRules.length > 0) setSelectedRuleId(txRules[0].id);
    }
  }, [config, evalStatus, selectedRuleId]);

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

  const rules = config ? buildRules(config, evalStatus) : { txRules: [], mcpRules: [] };
  const allRules = [...rules.txRules, ...rules.mcpRules];
  const selectedRule = allRules.find(r => r.id === selectedRuleId) || null;
  const activeEngine = evalStatus?.activeEngine || config?.status?.activeEngine || 'unknown';

  return (
    <div style={{ border: '1px solid #e5e5e5', borderRadius: '8px', overflow: 'hidden', background: '#fff', marginBottom: '24px' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e5e5', background: '#fafafa' }}>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#111' }}>Authorize Rules</h3>
        <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#666' }}>
          Browse the active authorization policy rules and test transactions against the engine.
        </p>
      </div>

      <div style={{ display: 'flex', minHeight: '400px' }}>
        <RuleList
          loading={configLoading}
          error={configError}
          adminFallback={adminFallback}
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
          config={config}
          adminFallback={adminFallback}
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
function RuleList({ loading, error, adminFallback, txRules, mcpRules, selectedRuleId, onSelect }) {
  const listStyle = {
    width: '240px',
    minWidth: '240px',
    borderRight: '1px solid #e5e5e5',
    overflowY: 'auto',
    background: '#fff',
  };

  const groupHeaderStyle = {
    padding: '8px 12px 5px',
    fontSize: '10px',
    fontWeight: 700,
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: '.06em',
    borderBottom: '1px solid #f0f0f0',
    background: '#fafafa',
  };

  if (loading) {
    return (
      <div style={listStyle}>
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
      <div style={{ ...listStyle, padding: '16px 12px' }}>
        <p style={{ fontSize: '12px', color: '#dc2626' }}>❌ {error}</p>
      </div>
    );
  }

  if (adminFallback) {
    return (
      <div style={{ ...listStyle, padding: '16px 12px' }}>
        <p style={{ fontSize: '12px', color: '#666' }}>Sign in as an admin to see rule details.</p>
      </div>
    );
  }

  return (
    <div style={listStyle}>
      <div style={groupHeaderStyle}>Transaction Rules</div>
      {txRules.map(rule => (
        <RuleCard key={rule.id} rule={rule} selected={rule.id === selectedRuleId} onSelect={onSelect} />
      ))}
      <div style={{ ...groupHeaderStyle, marginTop: '4px' }}>MCP Tool Rules</div>
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
      style={{
        padding: '10px 12px',
        cursor: 'pointer',
        borderBottom: '1px solid #f3f3f3',
        borderLeft: selected ? '3px solid #4f46e5' : '3px solid transparent',
        background: selected ? '#eef2ff' : '#fff',
        transition: 'background .1s',
      }}
    >
      <div style={{ fontSize: '12px', fontWeight: 600, color: '#111', marginBottom: '3px' }}>{rule.name}</div>
      <div style={{ fontSize: '11px', color: '#777', lineHeight: 1.4, marginBottom: '5px' }}>{rule.chips.value !== '—' ? rule.chips.value : rule.chips.scope}</div>
      <Badge type={rule.badge} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// RuleDetail
// ---------------------------------------------------------------------------
function RuleDetail({
  rule, activeEngine, config, adminFallback,
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
    <div style={{ flex: 1, padding: '18px 20px', overflowY: 'auto', background: '#fff' }}>
      {!rule && !adminFallback && (
        <p style={{ color: '#999', fontSize: '13px' }}>Select a rule from the list.</p>
      )}

      {adminFallback && (
        <>
          <p style={{ color: '#666', fontSize: '13px', marginBottom: '16px' }}>
            Sign in as an admin to browse rule details. You can still test the engine below.
          </p>
          <TestForm
            isMcp={false}
            testAmount={testAmount} setTestAmount={setTestAmount}
            testType={testType} setTestType={setTestType}
            testAcr={testAcr} setTestAcr={setTestAcr}
            testTool={testTool} setTestTool={setTestTool}
            testRunning={testRunning}
            onRunTest={onRunTest}
            resultDisplay={resultDisplay()}
          />
          <EngineNote note={engineNote()} />
        </>
      )}

      {rule && (
        <>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#111', marginBottom: '6px' }}>{rule.name}</div>
          <div style={{ fontSize: '13px', color: '#444', lineHeight: 1.6, marginBottom: '14px' }}>{rule.desc}</div>

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

          <TestForm
            isMcp={isMcp}
            testAmount={testAmount} setTestAmount={setTestAmount}
            testType={testType} setTestType={setTestType}
            testAcr={testAcr} setTestAcr={setTestAcr}
            testTool={testTool} setTestTool={setTestTool}
            testRunning={testRunning}
            onRunTest={onRunTest}
            resultDisplay={resultDisplay()}
          />

          <EngineNote note={engineNote()} />
        </>
      )}
    </div>
  );
}

function TestForm({ isMcp, testAmount, setTestAmount, testType, setTestType, testAcr, setTestAcr, testTool, setTestTool, testRunning, onRunTest, resultDisplay }) {
  const inputStyle = { width: '100%', border: '1px solid #d1d5db', borderRadius: '5px', padding: '6px 10px', fontSize: '12px', color: '#111', background: '#fff', boxSizing: 'border-box' };
  const labelStyle = { display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px' };

  return (
    <div style={{ background: '#f8f9fc', border: '1px solid #e5e5e5', borderRadius: '8px', padding: '14px 16px', marginBottom: '12px' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '10px' }}>
        Test this rule
      </div>

      {isMcp ? (
        <div style={{ marginBottom: '10px' }}>
          <label style={labelStyle}>Tool name</label>
          <input style={inputStyle} value={testTool} onChange={e => setTestTool(e.target.value)} placeholder="e.g. get_account_balance" />
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Amount (USD)</label>
            <input style={inputStyle} type="number" value={testAmount} onChange={e => setTestAmount(e.target.value)} placeholder="e.g. 300" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Transaction type</label>
            <select style={inputStyle} value={testType} onChange={e => setTestType(e.target.value)}>
              <option value="deposit">deposit</option>
              <option value="withdrawal">withdrawal</option>
              <option value="transfer">transfer</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>ACR (optional)</label>
            <input style={inputStyle} value={testAcr} onChange={e => setTestAcr(e.target.value)} placeholder="e.g. MFA" />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <button
          onClick={onRunTest}
          disabled={testRunning}
          style={{ background: testRunning ? '#6366f1' : '#4f46e5', color: '#fff', border: 'none', borderRadius: '6px', padding: '7px 18px', fontSize: '12px', fontWeight: 600, cursor: testRunning ? 'default' : 'pointer', opacity: testRunning ? 0.8 : 1 }}
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
