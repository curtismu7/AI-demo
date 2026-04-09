# Plan 115-03 Task 4: BankingAgent.js LangChain Integration Patches

## Overview

This patch set integrates the LangChain client service into the existing BankingAgent React component. The patches enable:

- **LangChain Agent Mode**: Routes natural language queries via the new LangChain service
- **HITL Consent Gates**: Displays consent modal for high-value operations (>$500)
- **Token Event Display**: Shows RFC 8693 token exchange details
- **Graceful Fallback**: Falls back to legacy NL parser if LangChain unavailable

## Patch Files

1. **115-03-BankingAgent-LangChain.patch** — Main component modifications
2. **115-03-BankingAgent-CSS.patch** — HITL modal styling

## Application Instructions

### Option 1: Apply patches with `git apply`

```bash
cd /Users/cmuir/P1Import-apps/Banking

# Apply component patch
git apply 115-03-BankingAgent-LangChain.patch

# Apply CSS patch  
git apply 115-03-BankingAgent-CSS.patch

# Verify no errors
npm run build --prefix banking_api_ui
```

### Option 2: Manual Application

If `git apply` encounters conflicts, apply changes manually:

#### Step 1: Add Imports (Line ~13-14)

After the existing `bankingAgentService` import, add:

```javascript
import {
  initAgent,
  sendMessage,
  recordConsent,
  formatTokenEvents,
  formatOperation,
} from '../services/bankingAgentLangChainClientService';
```

#### Step 2: Add New State (After `scopeErrorModal` state ~line 843)

```javascript
  // HITL Consent Flow — LangChain Agent Integration
  const [consentId, setConsentId] = useState(null);
  const [consentPending, setConsentPending] = useState(false);
  const [consentOperation, setConsentOperation] = useState(null);
  const [tokenEventsForConsent, setTokenEventsForConsent] = useState([]);

  // Flag: Agent is using LangChain mode (true) vs action-based (false)
  const [useLangChainAgent, setUseLangChainAgent] = useState(false);

  // Track last NL message for consent retry
  const [lastNlMessage, setLastNlMessage] = useState('');
  const lastNlMessageRef = useRef('');

  // Sync ref with state for access in closure
  useEffect(() => {
    lastNlMessageRef.current = lastNlMessage;
  }, [lastNlMessage]);
```

#### Step 3: Add Helper Functions (After `addMessage()` function ~line 1463)

```javascript
  /**
   * Handle HITL consent request from API (HTTP 428 response).
   */
  async function handleHitlConsent(data, tokenEventsFromResponse = []) {
    if (!data?.consentId || !data?.operation) {
      addMessage('error', 'Consent request missing consentId or operation details');
      return;
    }

    setConsentId(data.consentId);
    setConsentOperation(data.operation);
    setTokenEventsForConsent(tokenEventsFromResponse || []);
    setConsentPending(true);

    const op = data.operation;
    const opDesc = `${op.tool || 'tool'} (${formatCurrency(op.amount) || op.description})`;
    addMessage('assistant',
      `⏸️ This operation needs your approval:\n\n${opDesc}\n\nPlease review and decide below.`,
      'hitl-consent-request'
    );
  }

  /**
   * Record user's HITL consent decision (approve/reject) and retry or abort.
   */
  async function recordConsentDecision(decision) {
    if (!consentId) return;

    setConsentPending(false);

    try {
      const res = await recordConsent(consentId, decision);

      if (decision === 'approve') {
        addMessage('assistant',
          '✅ Consent approved. Resuming your request…',
          'hitl-consent-approved'
        );

        if (tokenEventsForConsent?.length > 0) {
          const tokenEventLines = formatTokenEvents(tokenEventsForConsent);
          addMessage('token-event',
            tokenEventLines.join('\n'),
            'hitl-token-events'
          );
        }

        if (lastNlMessageRef.current) {
          const text = lastNlMessageRef.current;
          addMessage('user', text);
          try {
            const msgRes = await sendMessage(text, consentId);
            if (msgRes.response) {
              addMessage('assistant', msgRes.response, 'langchain-response');
            }
            if (msgRes.tokenEvents?.length > 0) {
              const lines = formatTokenEvents(msgRes.tokenEvents);
              addMessage('token-event', lines.join('\n'), 'langchain-token-events');
            }
          } catch (err) {
            addMessage('error', `Could not retry request: ${err.message}`);
          }
        }
      } else {
        addMessage('assistant',
          '❌ Consent rejected. Your request was cancelled.',
          'hitl-consent-rejected'
        );
      }
    } catch (err) {
      addMessage('error', `Could not record consent decision: ${err.message}`);
    } finally {
      setConsentId(null);
      setConsentOperation(null);
      setTokenEventsForConsent([]);
    }
  }
```

#### Step 4: Replace `handleNaturalLanguage()` (Line ~2213)

Replace the entire function body with:

```javascript
  async function handleNaturalLanguage() {
    const text = nlInput.trim();
    if (!text) return;
    if (!isLoggedIn && !marketingGuestChatEnabled) return;
    if (isAgentBlockedByConsentDecline()) {
      addMessage('assistant', AGENT_CONSENT_BLOCK_USER_MESSAGE);
      return;
    }

    // Track for consent retry
    setLastNlMessage(text);

    // Sequential thinking: "think: [query]" or "reason: [query]"
    const thinkMatch = text.match(/^(?:think|reason):\s*(.+)/i);
    if (thinkMatch) {
      // ... [KEEP EXISTING THINKING LOGIC] ...
      return;
    }

    setNlLoading(true);
    addMessage('user', text);
    setNlInput('');

    try {
      // TRY LANGCHAIN AGENT FIRST
      const msgRes = await sendMessage(text);

      // Check for 428 Precondition Required (HITL consent needed)
      if (msgRes.status === 428) {
        await handleHitlConsent(msgRes.data, msgRes.tokenEvents);
        setNlLoading(false);
        return;
      }

      if (msgRes.response) {
        addMessage('assistant', msgRes.response, 'langchain-agent');

        if (msgRes.tokenEvents?.length > 0) {
          const tokenEventLines = formatTokenEvents(msgRes.tokenEvents);
          addMessage('token-event',
            tokenEventLines.join('\n'),
            'langchain-token-events'
          );
        }
      }
      setNlLoading(false);
      return;

    } catch (langchainErr) {
      // LangChain unavailable — fallback to legacy NL parser
      console.warn('[BankingAgent] LangChain fallback due to:', langchainErr.message);
    }

    // FALLBACK: Legacy Natural Language Parser
    try {
      const logQuery = parseLogPrompt(text);
      if (logQuery) {
        // ... [KEEP EXISTING LOG QUERY LOGIC] ...
        return;
      }
      const { source, result } = await parseNaturalLanguage(text);
      await dispatchNlResult(result, source, text);
    } catch (err) {
      reportNlFailure(err);
    } finally {
      setNlLoading(false);
    }
  }
```

**Note:** Keep the sequential thinking logic and log query handling — only replace the try/catch structure.

#### Step 5: Add HITL Consent Modal JSX (After main panel ~line 3005)

Add before the closing fragment:

```jsx
      {/* HITL Consent Modal — LangChain High-Value Operations */}
      {consentPending && consentOperation && (
        <div className="ba-modal-overlay" onClick={() => setConsentPending(false)}>
          <div className="ba-modal-content ba-hitl-modal">
            <div className="ba-modal-header">
              <h3>⏸️ Approval Required</h3>
              <button
                className="ba-modal-close"
                onClick={() => recordConsentDecision('reject')}
              >
                ✕
              </button>
            </div>
            <div className="ba-modal-body">
              <p>This operation requires your approval:</p>
              <div className="ba-consent-operation">
                <div className="ba-consent-detail">
                  <span className="ba-consent-label">Tool:</span>
                  <span className="ba-consent-value">{consentOperation.tool}</span>
                </div>
                {consentOperation.amount && (
                  <div className="ba-consent-detail">
                    <span className="ba-consent-label">Amount:</span>
                    <span className="ba-consent-value">{formatCurrency(consentOperation.amount)}</span>
                  </div>
                )}
                {consentOperation.description && (
                  <div className="ba-consent-detail">
                    <span className="ba-consent-label">Description:</span>
                    <span className="ba-consent-value">{consentOperation.description}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="ba-modal-footer">
              <button className="ba-button ba-button--secondary" onClick={() => recordConsentDecision('reject')}>Reject</button>
              <button className="ba-button ba-button--primary" onClick={() => recordConsentDecision('approve')}>Approve</button>
            </div>
          </div>
        </div>
      )}
```

#### Step 6: Add CSS Styling

Append to `banking_api_ui/src/components/BankingAgent.css`:

```css
/* HITL Consent Modal */

.ba-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.ba-modal-content {
  background: white;
  border-radius: 8px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
  max-width: 400px;
  width: 90%;
}

.ba-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid #e5e7eb;
}

.ba-modal-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.ba-modal-close {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  padding: 0;
  color: #6b7280;
}

.ba-modal-body {
  padding: 20px;
}

.ba-consent-operation {
  background: rgba(0, 0, 0, 0.05);
  border-radius: 8px;
  padding: 16px;
  margin: 16px 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ba-consent-detail {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
}

.ba-consent-detail:last-child {
  border-bottom: none;
}

.ba-consent-label {
  font-weight: 600;
  color: #666;
}

.ba-consent-value {
  font-family: monospace;
  font-weight: 500;
  color: #333;
  text-align: right;
}

.ba-modal-footer {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  padding: 20px;
  border-top: 1px solid #e5e7eb;
}

.ba-button {
  padding: 10px 16px;
  border-radius: 6px;
  border: 1px solid transparent;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.ba-button--secondary {
  background: #f3f4f6;
  color: #1f2937;
  border-color: #d1d5db;
}

.ba-button--secondary:hover {
  background: #e5e7eb;
}

.ba-button--primary {
  background: #2563eb;
  color: white;
}

.ba-button--primary:hover {
  background: #1d4ed8;
}

.ba-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

## Verification

After applying patches:

```bash
# Verify TypeScript compilation
npm run build --prefix banking_api_ui

# Should exit with code 0 (no errors)
```

## Testing

### 1. **Basic LangChain Query**
- Open agent in browser
- Send: *"Show my accounts"*
- Expected: LangChain response with account details (via new service)

### 2. **High-Value Operation (HITL Consent)**
- Send: *"Transfer $600 from checking to savings"*
- Expected: 
  - Message: "⏸️ This operation needs your approval"
  - Modal appears with operation details ($600)
  - Click "Approve" → continues with consentId
  - Click "Reject" → cancels operation

### 3. **Token Event Display**
- After successful high-value operation
- Expected: Token event message showing RFC 8693 exchange details

### 4. **Fallback Behavior**
- If LangChain service unavailable
- Send: *"Show my accounts"*
- Expected: Gracefully falls back to legacy NL parser

## Rollback

If needed, revert the patches:

```bash
git checkout -- banking_api_ui/src/components/BankingAgent.js
git checkout -- banking_api_ui/src/components/BankingAgent.css
```

## Integration Status

| Component | File | Status |
|-----------|------|--------|
| LangChain Service | `bankingAgentLangChainClientService.js` | ✅ Created (115-03 Task 3) |
| OAuth Middleware | `agentSessionMiddleware.js` | ✅ Created (115-02 Task 1) |
| HITL Middleware | `hitlGatewayMiddleware.js` | ✅ Created (115-03 Task 1) |
| API Routes | `bankingAgentRoutes.js` | ✅ Created (115-03 Task 2) |
| React Component | `BankingAgent.js` | 🔄 This patch (115-03 Task 4) |

## Next Steps

After applying patches:

1. ✅ Apply both patch files
2. ✅ Run `npm run build` to verify no errors
3. ✅ Test basic LangChain query
4. ✅ Test high-value operation (HITL modal)
5. ✅ Test token event display
6. ✅ Test fallback behavior
7. 📋 Create `115-03-SUMMARY.md` with results
8. 📋 Present checkpoint verification (curl tests)
