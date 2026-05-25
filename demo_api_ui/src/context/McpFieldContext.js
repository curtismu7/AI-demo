// demo_api_ui/src/context/McpFieldContext.js
import React, { createContext, useContext, useReducer, useCallback } from 'react';

/**
 * State shape: { [fieldKey]: { value: string, source: string|null } }
 */
const McpFieldContext = createContext(null);

function reducer(state, action) {
  switch (action.type) {
    case 'SET_FIELD':
      return {
        ...state,
        [action.key]: { value: action.value, source: action.source || null },
      };
    case 'CLEAR_FIELD':
      return { ...state, [action.key]: { value: '', source: null } };
    default:
      return state;
  }
}

export function McpFieldProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, {});
  return (
    <McpFieldContext.Provider value={{ state, dispatch }}>
      {children}
    </McpFieldContext.Provider>
  );
}

/**
 * Low-level hook — returns raw context. Prefer useMcpFieldState for components.
 */
export function useMcpField(fieldKey) {
  const ctx = useContext(McpFieldContext);
  if (!ctx) throw new Error('useMcpField must be used inside McpFieldProvider');

  const entry = ctx.state[fieldKey] || { value: '', source: null };

  const setValue = useCallback(
    (value, source) => ctx.dispatch({ type: 'SET_FIELD', key: fieldKey, value, source }),
    [ctx, fieldKey]
  );

  const clear = useCallback(
    () => ctx.dispatch({ type: 'CLEAR_FIELD', key: fieldKey }),
    [ctx, fieldKey]
  );

  return { value: entry.value, source: entry.source, setValue, clear };
}
