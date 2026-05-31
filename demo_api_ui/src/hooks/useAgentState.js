/**
 * useAgentState.js
 *
 * AG-UI Step 3 — Shared agent state manager.
 *
 * Maintains the full AgentRunState (mirrors server-side shape):
 *   tokenEvents[], mcpTraffic[], authorizeDecisions[], archTrace[],
 *   auditEvents[], activeRun, messages[], toolCalls[]
 *
 * State is updated by:
 *   - onStateSnapshot: full state replacement (on connect)
 *   - onStateDelta: JSON Patch operations (incremental updates)
 *   - onEvent: individual event processing for messages + toolCalls lists
 *
 * Returns:
 *   { state, handlers, reset }
 *
 * handlers is an object to spread into useAgentRun:
 *   { onEvent, onStateSnapshot, onStateDelta, onFinished, onError }
 */

import { useState, useCallback, useRef } from 'react';
import { applyJsonPatch } from './useAgentRun';

const INITIAL_STATE = {
  // Observability slices (driven by STATE_DELTA)
  tokenEvents: [],
  mcpTraffic: [],
  authorizeDecisions: [],
  archTrace: [],
  auditEvents: [],
  // Active run metadata
  activeRun: null,
  // Chat thread (built from AG-UI text + tool events)
  messages: [],
  toolCalls: [],
  // HITL
  hitlPending: null,
  // Run outcome
  lastOutcome: null,
  error: null,
  // Token usage emitted by the active agent runtime (null = not reported)
  lastTokenUsage: null,
};

export function useAgentState() {
  const [state, setState] = useState(INITIAL_STATE);

  // Accumulate text content for streaming messages
  const streamingMessageRef = useRef(null);
  const streamingToolCallRef = useRef(null);

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
    streamingMessageRef.current = null;
    streamingToolCallRef.current = null;
  }, []);

  const onStateSnapshot = useCallback((snapshot) => {
    if (!snapshot) return;
    setState((prev) => ({
      ...prev,
      tokenEvents: snapshot.tokenEvents || [],
      mcpTraffic: snapshot.mcpTraffic || [],
      authorizeDecisions: snapshot.authorizeDecisions || [],
      archTrace: snapshot.archTrace || [],
      auditEvents: snapshot.auditEvents || [],
      activeRun: snapshot.activeRun || null,
    }));
  }, []);

  const onStateDelta = useCallback((operations) => {
    if (!Array.isArray(operations)) return;
    setState((prev) => {
      // Only apply delta to the observability slices + activeRun — not messages/toolCalls
      const slicePrev = {
        tokenEvents: prev.tokenEvents,
        mcpTraffic: prev.mcpTraffic,
        authorizeDecisions: prev.authorizeDecisions,
        archTrace: prev.archTrace,
        auditEvents: prev.auditEvents,
        activeRun: prev.activeRun,
      };
      const sliceNext = applyJsonPatch(slicePrev, operations);
      return { ...prev, ...sliceNext };
    });
  }, []);

  const onEvent = useCallback((event) => {
    if (!event || !event.type) return;

    switch (event.type) {
      case 'RUN_STARTED':
        setState((prev) => ({ ...prev, lastOutcome: null, error: null, hitlPending: null, lastTokenUsage: null }));
        break;

      case 'TEXT_MESSAGE_START':
        streamingMessageRef.current = {
          id: event.messageId,
          role: event.role || 'assistant',
          content: '',
          streaming: true,
        };
        setState((prev) => ({
          ...prev,
          messages: [...prev.messages, streamingMessageRef.current],
        }));
        break;

      case 'TEXT_MESSAGE_CONTENT':
        if (streamingMessageRef.current && event.messageId === streamingMessageRef.current.id) {
          streamingMessageRef.current = {
            ...streamingMessageRef.current,
            content: streamingMessageRef.current.content + (event.delta || ''),
          };
          setState((prev) => {
            const msgs = [...prev.messages];
            const idx = msgs.findIndex((m) => m.id === event.messageId);
            if (idx !== -1) {
              msgs[idx] = { ...streamingMessageRef.current };
            }
            return { ...prev, messages: msgs };
          });
        }
        break;

      case 'TEXT_MESSAGE_END':
        if (streamingMessageRef.current && event.messageId === streamingMessageRef.current.id) {
          streamingMessageRef.current = {
            ...streamingMessageRef.current,
            streaming: false,
          };
          setState((prev) => {
            const msgs = [...prev.messages];
            const idx = msgs.findIndex((m) => m.id === event.messageId);
            if (idx !== -1) {
              msgs[idx] = { ...streamingMessageRef.current };
            }
            return { ...prev, messages: msgs };
          });
          streamingMessageRef.current = null;
        }
        break;

      case 'TOOL_CALL_START':
        streamingToolCallRef.current = {
          id: event.toolCallId,
          name: event.toolCallName,
          args: null,
          result: null,
          status: 'running',
        };
        setState((prev) => ({
          ...prev,
          toolCalls: [...prev.toolCalls, streamingToolCallRef.current],
        }));
        break;

      case 'TOOL_CALL_ARGS':
        if (streamingToolCallRef.current && event.toolCallId === streamingToolCallRef.current.id) {
          let args = null;
          try { args = JSON.parse(event.delta || '{}'); } catch (_) {}
          streamingToolCallRef.current = { ...streamingToolCallRef.current, args };
          setState((prev) => {
            const calls = [...prev.toolCalls];
            const idx = calls.findIndex((c) => c.id === event.toolCallId);
            if (idx !== -1) calls[idx] = { ...streamingToolCallRef.current };
            return { ...prev, toolCalls: calls };
          });
        }
        break;

      case 'TOOL_CALL_END':
        if (streamingToolCallRef.current && event.toolCallId === streamingToolCallRef.current.id) {
          streamingToolCallRef.current = { ...streamingToolCallRef.current, status: 'done' };
          setState((prev) => {
            const calls = [...prev.toolCalls];
            const idx = calls.findIndex((c) => c.id === event.toolCallId);
            if (idx !== -1) calls[idx] = { ...streamingToolCallRef.current };
            return { ...prev, toolCalls: calls };
          });
          streamingToolCallRef.current = null;
        }
        break;

      case 'TOOL_CALL_RESULT':
        setState((prev) => {
          const calls = [...prev.toolCalls];
          const idx = calls.findIndex((c) => c.id === event.toolCallId);
          if (idx !== -1) {
            let result = event.result;
            try { result = JSON.parse(event.result); } catch (_) {}
            calls[idx] = { ...calls[idx], result, status: 'done' };
          }
          return { ...prev, toolCalls: calls };
        });
        break;

      case 'RUN_FINISHED': {
        const outcome = event.outcome || {};
        if (outcome.type === 'interrupt' && outcome.interrupts?.length > 0) {
          setState((prev) => ({
            ...prev,
            hitlPending: outcome.interrupts[0],
            lastOutcome: outcome,
          }));
        } else {
          setState((prev) => ({
            ...prev,
            hitlPending: null,
            lastOutcome: outcome,
          }));
        }
        break;
      }

      case 'RUN_ERROR':
        setState((prev) => ({ ...prev, error: event.message || 'Agent error' }));
        break;

      case 'CUSTOM':
        if (event.name === 'token_usage' && event.value) {
          setState((prev) => ({
            ...prev,
            lastTokenUsage: {
              inputTokens: event.value.inputTokens ?? 0,
              outputTokens: event.value.outputTokens ?? 0,
            },
          }));
        }
        break;

      default:
        break;
    }
  }, []);

  const onFinished = useCallback((outcome) => {
    // Already handled in onEvent RUN_FINISHED; no additional work needed
    void outcome;
  }, []);

  const onError = useCallback((msg) => {
    setState((prev) => ({ ...prev, error: msg }));
  }, []);

  const handlers = { onEvent, onStateSnapshot, onStateDelta, onFinished, onError };

  return { state, handlers, reset };
}
