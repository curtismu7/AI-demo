import React, { useEffect, useState, useCallback } from 'react';
import Monaco from '@monaco-editor/react';
import { useVertical } from '../useVertical';
import { OverlayBadge } from './OverlayBadge';
import { CloneModal } from './CloneModal';

const PROTECTED = new Set(['banking', 'admin-console']);

/**
 * Compute leaf-level differences between `edited` and `seed`. Returns an array
 * of { path, value } where path is dot notation. Arrays are compared by
 * JSON.stringify (matches the resolver's "arrays replaced wholesale" rule).
 */
function diff(seed, edited, prefix = '') {
  const out = [];
  const keys = new Set([...Object.keys(seed || {}), ...Object.keys(edited || {})]);
  for (const k of keys) {
    const p = prefix ? `${prefix}.${k}` : k;
    const sv = seed?.[k];
    const ev = edited?.[k];
    const bothObj =
      sv && ev &&
      typeof sv === 'object' && typeof ev === 'object' &&
      !Array.isArray(sv) && !Array.isArray(ev);
    if (bothObj) {
      out.push(...diff(sv, ev, p));
    } else if (JSON.stringify(sv) !== JSON.stringify(ev)) {
      out.push({ path: p, value: ev });
    }
  }
  return out;
}

export function VerticalEditorPage() {
  const { pageManifest, refetch } = useVertical();
  const [editorValue, setEditorValue] = useState('');
  const [seedValue, setSeedValue] = useState('');
  const [list, setList] = useState([]);
  const [showClone, setShowClone] = useState(false);
  const [snapshotInfo, setSnapshotInfo] = useState(null);
  const [error, setError] = useState('');

  const id = pageManifest?.id;
  const isProtected = id ? PROTECTED.has(id) : true;

  useEffect(() => {
    fetch('/api/verticals/list', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then(setList)
      .catch(() => setList([]));
  }, []);

  useEffect(() => {
    if (!pageManifest) return;
    const json = JSON.stringify(pageManifest, null, 2);
    setEditorValue(json);
    setSeedValue(json);
    setError('');
  }, [pageManifest]);

  const save = useCallback(async () => {
    setError('');
    let edited;
    try { edited = JSON.parse(editorValue); }
    catch (e) { setError('Invalid JSON: ' + e.message); return; }
    const seed = JSON.parse(seedValue);
    const entries = diff(seed, edited);
    if (entries.length === 0) return;
    const res = await fetch(`/api/verticals/${id}/overlay/batch`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(`Save failed: ${body.error || res.status}`);
    }
  }, [editorValue, seedValue, id]);

  const resetThisVertical = useCallback(async () => {
    await fetch(`/api/verticals/${id}/overlay`, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
  }, [id]);

  const resetAllVerticals = useCallback(async () => {
    if (!window.confirm('Reset ALL verticals to their seed defaults? This wipes every override.')) return;
    await fetch('/api/verticals/reset-all', { method: 'POST', credentials: 'include' });
  }, []);

  const setActive = useCallback(async (newId) => {
    await fetch('/api/verticals/active', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: newId }),
    });
  }, []);

  const doDelete = useCallback(async () => {
    if (!window.confirm(`Delete vertical "${id}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/verticals/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(`Delete failed: ${body.error || res.status}`);
    }
  }, [id]);

  const doClone = useCallback(async ({ newId, displayName }) => {
    const res = await fetch(`/api/verticals/${id}/clone`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newId, displayName }),
    });
    if (res.ok) {
      setShowClone(false);
      await setActive(newId);
    } else {
      const body = await res.json().catch(() => ({}));
      setError(`Clone failed: ${body.error || res.status}`);
    }
  }, [id, setActive]);

  const saveSnapshot = useCallback(async () => {
    const res = await fetch('/api/verticals/snapshot', {
      method: 'POST', credentials: 'include',
    });
    if (res.ok) setSnapshotInfo(await res.json());
  }, []);

  const restoreSnapshot = useCallback(async () => {
    if (!window.confirm('Restore your saved state? Current overrides will be replaced.')) return;
    await fetch('/api/verticals/snapshot/restore', { method: 'POST', credentials: 'include' });
  }, []);

  if (!pageManifest) return <div>Loading…</div>;

  return (
    <div className="vertical-editor">
      <header className="vertical-editor__header">
        <label>
          Active:
          <select value={id} onChange={(e) => setActive(e.target.value)}>
            {list.map((v) => (
              <option key={v.id} value={v.id}>{v.displayName}</option>
            ))}
          </select>
        </label>
        <button onClick={() => setShowClone(true)} type="button">+ Clone vertical</button>
        {!isProtected && <button onClick={doDelete} type="button">Delete</button>}
        <button onClick={resetThisVertical} disabled={isProtected} type="button">
          Reset this vertical to seed
        </button>
        <button onClick={resetAllVerticals} type="button">Reset all verticals to seed</button>
        <button onClick={saveSnapshot} type="button">Save state</button>
        <button onClick={restoreSnapshot} type="button">
          {snapshotInfo
            ? `Restore saved state · ${new Date(snapshotInfo.savedAt).toLocaleString()}`
            : 'Restore saved state'}
        </button>
      </header>

      {error && <div className="vertical-editor__error">{error}</div>}

      <div className="vertical-editor__body">
        <aside className="vertical-editor__sidebar">
          <OverlayBadge paths={[]} onResetField={() => {}} onResetAll={resetThisVertical} />
        </aside>
        <main className="vertical-editor__main">
          <Monaco
            language="json"
            value={editorValue}
            onChange={(v) => setEditorValue(v || '')}
            options={{ formatOnPaste: true, formatOnType: true, minimap: { enabled: false } }}
          />
          <div className="vertical-editor__actions">
            <button onClick={save} type="button">Save</button>
            <button onClick={() => setEditorValue(seedValue)} type="button">Discard</button>
          </div>
        </main>
      </div>

      {showClone && (
        <CloneModal
          sourceId={id}
          existingIds={list.map((v) => v.id)}
          onClose={() => setShowClone(false)}
          onSubmit={doClone}
        />
      )}
    </div>
  );
}
