import React, { useState, useEffect } from 'react';

const WORKER_FIELDS = [
  { key: 'pingone_environment_id', label: 'Environment ID',       secret: false, placeholder: 'PingOne Environment UUID' },
  { key: 'pingone_client_id',      label: 'Worker Client ID',     secret: false, placeholder: 'Management API worker client_id' },
  { key: 'pingone_client_secret',  label: 'Worker Client Secret', secret: true,  placeholder: '••••••••••••' },
];

export default function WorkerAppConfigTab() {
  const [values, setValues]   = useState({ pingone_environment_id: '', pingone_client_id: '', pingone_client_secret: '' });
  const [saving, setSaving]   = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // null | { ok, environmentId, appName, applicationCount, error, hint }

  useEffect(() => {
    fetch('/api/admin/config')
      .then(r => r.json())
      .then(data => {
        const cfg = data.config || {};
        setValues(v => ({
          ...v,
          pingone_environment_id: cfg.pingone_environment_id || '',
          pingone_client_id:      cfg.pingone_client_id || '',
          // Secret is masked — keep blank so user can re-enter if needed
          pingone_client_secret:  '',
        }));
      })
      .catch(() => {}); // silent — config may not be set yet
  }, []);

  const handleChange = (key, val) => setValues(v => ({ ...v, [key]: val }));

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg('');
    try {
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      setSaveMsg(data.ok ? '✓ Saved' : `Error: ${data.message || 'save failed'}`);
    } catch (err) {
      setSaveMsg(`Error: ${err.message}`);
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(''), 3000);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/admin/config/worker-test');
      const data = await res.json();
      setTestResult(data);
    } catch (err) {
      setTestResult({ ok: false, error: err.message });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div style={{ padding: '24px 0' }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e40af', marginBottom: 4 }}>
        PingOne Management API — Worker App
      </h3>
      <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 20 }}>
        Credentials for the PingOne worker app used for user provisioning, CIMD registration, and bootstrap operations.
      </p>

      {WORKER_FIELDS.map(({ key, label, secret, placeholder }) => (
        <div key={key} style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
            {label}
          </label>
          <input
            type={secret ? 'password' : 'text'}
            value={values[key]}
            onChange={e => handleChange(key, e.target.value)}
            placeholder={placeholder}
            aria-label={label}
            style={{
              width: '100%',
              maxWidth: 480,
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              fontSize: 13,
              fontFamily: 'monospace',
              boxSizing: 'border-box',
            }}
          />
        </div>
      ))}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 20 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '8px 20px',
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={handleTest}
          disabled={testing}
          style={{
            padding: '8px 20px',
            background: '#f3f4f6',
            color: '#374151',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            cursor: testing ? 'not-allowed' : 'pointer',
            opacity: testing ? 0.7 : 1,
          }}
        >
          {testing ? 'Testing…' : 'Test Connection'}
        </button>
        {saveMsg && (
          <span style={{ fontSize: 13, color: saveMsg.startsWith('✓') ? '#16a34a' : '#dc2626' }}>
            {saveMsg}
          </span>
        )}
      </div>

      {testResult && (
        <div style={{
          marginTop: 16,
          padding: '12px 16px',
          borderRadius: 8,
          background: testResult.ok ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${testResult.ok ? '#86efac' : '#fca5a5'}`,
          color: testResult.ok ? '#166534' : '#991b1b',
          fontSize: 13,
        }}>
          {testResult.ok
            ? `✓ Connected — Environment: ${testResult.environmentId} · App: ${testResult.appName} (${testResult.applicationCount} apps found)`
            : `✗ Connection failed: ${testResult.error || 'Unknown error'}${testResult.hint ? ` — ${testResult.hint}` : ''}`
          }
        </div>
      )}
    </div>
  );
}
