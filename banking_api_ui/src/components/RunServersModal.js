import React, { useState, useEffect, useRef, useCallback } from 'react';
import './RunServersModal.css';

const SERVICES = [
  { name: 'API Server', port: ':3001' },
  { name: 'UI Server', port: ':4000' },
  { name: 'MCP Server', port: ':8080' },
  { name: 'LangChain Agent', port: ':8888' },
];

function detectService(line) {
  if (line.includes(':3001') || line.toLowerCase().includes('banking api')) return 'API Server';
  if (line.includes(':4000') || line.toLowerCase().includes('banking ui')) return 'UI Server';
  if (line.includes(':8080') || line.toLowerCase().includes('mcp')) return 'MCP Server';
  if (line.includes(':8888') || line.toLowerCase().includes('langchain')) return 'LangChain Agent';
  return null;
}

export default function RunServersModal({ onClose }) {
  const [lines, setLines] = useState([]);
  const [cards, setCards] = useState({});
  const [status, setStatus] = useState('streaming');
  const [exitCode, setExitCode] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [autoDismissCountdown, setAutoDismissCountdown] = useState(3);
  const [retryKey, setRetryKey] = useState(0);
  const bottomRef = useRef(null);

  // Auto-scroll whenever lines change
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [lines]);

  // Auto-dismiss countdown when done
  useEffect(() => {
    if (status !== 'done') return;
    if (autoDismissCountdown <= 0) {
      onClose();
      return;
    }
    const timer = setInterval(() => {
      setAutoDismissCountdown((n) => n - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [status, autoDismissCountdown, onClose]);

  // Fire SSE stream — retryKey causes re-run on retry
  useEffect(() => {
    let cancelled = false;

    // Reset state for each attempt
    setLines([]);
    setCards({});
    setStatus('streaming');
    setExitCode(null);
    setErrorMessage(null);

    async function startStream() {
      let res;
      try {
        res = await fetch('/api/dev/run-servers', {
          method: 'POST',
          credentials: 'include',
        });
      } catch (err) {
        if (!cancelled) {
          setErrorMessage(err.message || 'Network error — could not reach server');
          setExitCode(null);
          setStatus('error');
        }
        return;
      }

      if (res.status === 409) {
        if (!cancelled) setStatus('already_running');
        return;
      }
      if (res.status === 403) {
        if (!cancelled) setStatus('forbidden');
        return;
      }
      if (!res.ok) {
        if (!cancelled) {
          setErrorMessage('HTTP ' + res.status + ' ' + res.statusText);
          setExitCode(null);
          setStatus('error');
        }
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let streamEnded = false;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) { streamEnded = true; break; }
          if (cancelled) { reader.cancel(); break; }
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split('\n\n');
          buffer = events.pop();
          for (const event of events) {
            const dataLine = event.replace(/^data: /, '').trim();
            if (!dataLine) continue;
            try {
              const parsed = JSON.parse(dataLine);
              if (cancelled) break;
              handleEvent(parsed);
            } catch (_) {}
          }
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMessage(err.message || 'Stream read error');
          setExitCode(null);
          setStatus('error');
        }
        return;
      }

      // Stream closed without a done/error event — treat as error
      if (streamEnded && !cancelled) {
        setStatus((prev) => {
          if (prev === 'streaming') {
            setErrorMessage('Server closed the stream without a final status event');
            setExitCode(null);
            return 'error';
          }
          return prev;
        });
      }
    }

    function handleEvent(parsed) {
      if (parsed.line !== undefined) {
        setLines((prev) => [...prev, { text: parsed.line, type: parsed.type }]);
        const svc = detectService(parsed.line);
        if (svc) {
          setCards((prev) => ({ ...prev, [svc]: { name: svc, detected: true } }));
        }
      } else if (parsed.type === 'done') {
        setExitCode(parsed.exitCode ?? 0);
        setStatus('done');
        setAutoDismissCountdown(3);
      } else if (parsed.type === 'error') {
        setExitCode(parsed.exitCode ?? 1);
        setErrorMessage(parsed.message || null);
        setStatus('error');
      }
    }

    startStream();
    return () => { cancelled = true; };
  }, [retryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRetry = useCallback(() => {
    setRetryKey((k) => k + 1);
  }, []);

  // Last few stderr lines shown in error summary
  const lastErrors = lines.filter((l) => l.type === 'stderr').slice(-3);

  return (
    <div className="rsm-overlay" role="dialog" aria-modal="true" aria-label="Run Servers">
      <div className="rsm-box">
        <div className="rsm-header">
          <span className="rsm-title">▶ Run Servers</span>
          <button type="button" className="rsm-close-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="rsm-cards">
          {SERVICES.map((svc) => {
            const detected = !!cards[svc.name]?.detected;
            return (
              <div key={svc.name} className={'rsm-card' + (detected ? ' rsm-card--detected' : '')}>
                <span className="rsm-card-icon">{detected ? '✅' : '🔄'}</span>
                <span className="rsm-card-name">{svc.name}</span>
                <span className="rsm-card-port">{svc.port}</span>
              </div>
            );
          })}
        </div>

        {status === 'error' && (
          <div className="rsm-error-callout">
            <span className="rsm-error-label">
              ❌ Script failed{exitCode !== null ? ' (exit code ' + exitCode + ')' : ''}
            </span>
            {errorMessage && (
              <span className="rsm-error-detail">{errorMessage}</span>
            )}
            {lastErrors.length > 0 && (
              <div className="rsm-error-lines">
                {lastErrors.map((l, i) => (
                  <div key={i} className="rsm-error-line">{l.text}</div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="rsm-log" role="log" aria-live="polite">
          {lines.map((l, i) => (
            <div
              key={i}
              className={'rsm-log-line' + (l.type === 'stderr' ? ' rsm-log-line--stderr' : '')}
            >
              {l.text}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <div className="rsm-footer">
          {status === 'streaming' && <span>⏳ Starting servers...</span>}
          {status === 'done' && (
            <span>✅ All servers up — closing in {autoDismissCountdown}s</span>
          )}
          {status === 'error' && (
            <>
              <span className="rsm-footer-spacer" />
              <button type="button" className="rsm-retry-btn" onClick={handleRetry}>
                ↺ Retry
              </button>
              <button type="button" className="rsm-close-action-btn" onClick={onClose}>
                Close
              </button>
            </>
          )}
          {status === 'already_running' && (
            <>
              <span>⚠ Already starting, please wait</span>
              <button type="button" className="rsm-close-action-btn" onClick={onClose}>
                Close
              </button>
            </>
          )}
          {status === 'forbidden' && (
            <>
              <span>⛔ Not available in this environment</span>
              <button type="button" className="rsm-close-action-btn" onClick={onClose}>
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
