# Code Refactoring Examples

## Example 1: useEffect Cleanup Pattern

### ❌ BEFORE: Memory Leak Risk
```javascript
// src/components/BankingAgent.js (likely pattern)
useEffect(() => {
  fetchMessages();
}, []);

async function fetchMessages() {
  const res = await fetch('/api/messages');
  const data = await res.json();
  setMessages(data); // ← Can fire after unmount!
}
```

**Problems:**
- `fetchMessages` completes after component unmounts
- `setMessages` called on unmounted component = memory leak warning
- No error handling
- No request cancellation

### ✅ AFTER: Safe Pattern with Cleanup
```javascript
/**
 * Fetches chat messages from server with proper cleanup
 * @param {string} sessionId - Session identifier
 * @returns {Promise<Array>} Messages array
 */
useEffect(() => {
  let isMounted = true;
  const controller = new AbortController();

  const fetchMessages = async () => {
    try {
      const res = await fetch('/api/messages', {
        signal: controller.signal,
      });
      
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      
      // Only update state if component still mounted
      if (isMounted) {
        setMessages(data);
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Failed to fetch messages:', error);
        setError(error);
        showErrorToast('Failed to load messages');
      }
    }
  };

  fetchMessages();

  // Cleanup: cancel request + mark unmounted
  return () => {
    isMounted = false;
    controller.abort();
  };
}, [sessionId]); // Add dependencies!
```

**Benefits:**
- No memory leaks
- Handles HTTP errors gracefully
- Cancels request if component unmounts
- Dependency array correct

---

## Example 2: State Management Consolidation

### ❌ BEFORE: 60 useState Calls
```javascript
// BankingAgent.js excerpt
const [messages, setMessages] = useState([]);
const [isOpen, setIsOpen] = useState(false);
const [selectedAction, setSelectedAction] = useState(null);
const [isLoading, setIsLoading] = useState(false);
const [error, setError] = useState(null);
const [tokenChain, setTokenChain] = useState([]);
const [compliance, setCompliance] = useState({});
// ... 53 more useState calls

function addMessage(msg) {
  setMessages([...messages, msg]);
}

function togglePanel() {
  setIsOpen(!isOpen);
}
```

**Problems:**
- Impossible to understand state relationships
- Easy to get out of sync
- Hard to persist/restore
- No type safety

### ✅ AFTER: Custom Hook + Zustand Store
```javascript
// hooks/useAgentState.js
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Agent state store with persistence
 * @returns {Object} Agent state and actions
 */
export const useAgentStore = create(
  persist(
    (set, get) => ({
      // State
      messages: [],
      isOpen: false,
      selectedAction: null,
      isLoading: false,
      error: null,
      tokenChain: [],
      compliance: {},
      session: null,

      // Actions with JSDoc
      /**
       * Add message to chat history
       * @param {string} role - 'user' or 'assistant'
       * @param {string} content - Message text
       * @param {Object} metadata - Optional metadata (tokens, etc)
       */
      addMessage: (role, content, metadata = {}) => {
        const msg = {
          id: crypto.randomUUID(),
          role,
          content,
          timestamp: Date.now(),
          ...metadata,
        };
        
        set((state) => ({
          messages: [...state.messages, msg],
        }));
      },

      /**
       * Clear all messages
       */
      clearMessages: () => set({ messages: [] }),

      /**
       * Toggle panel visibility
       */
      toggleOpen: () => set((state) => ({ isOpen: !state.isOpen })),

      /**
       * Set error with automatic cleanup
       * @param {Error|null} error - Error object or null to clear
       */
      setError: (error) => {
        set({ error });
        if (error) {
          setTimeout(() => set({ error: null }), 5000);
        }
      },

      /**
       * Set loading state
       * @param {boolean} loading - Loading state
       */
      setLoading: (loading) => set({ isLoading: loading }),

      /**
       * Reset entire state
       */
      reset: () => set({
        messages: [],
        isOpen: false,
        selectedAction: null,
        isLoading: false,
        error: null,
        tokenChain: [],
        compliance: {},
      }),
    }),
    {
      name: 'agent-storage',
      version: 1,
      // Optional: custom serialization
      partialize: (state) => ({
        messages: state.messages,
        // Don't persist UI state (isOpen, selectedAction)
      }),
    }
  )
);

// In BankingAgent.js
function BankingAgent() {
  const {
    messages,
    isOpen,
    addMessage,
    toggleOpen,
    setError,
    setLoading,
  } = useAgentStore();

  // Much cleaner!
  const handleSendMessage = async (content) => {
    addMessage('user', content);
    setLoading(true);

    try {
      const res = await callAgent(content);
      addMessage('assistant', res.reply);
    } catch (error) {
      setError(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="agent">
      <ChatPanel messages={messages} />
      <InputArea onSend={handleSendMessage} />
      <button onClick={toggleOpen}>
        {isOpen ? 'Collapse' : 'Expand'}
      </button>
    </div>
  );
}
```

**Benefits:**
- Single source of truth
- Easy to understand relationships
- Automatic persistence
- Testable in isolation
- Type-safe with TypeScript

---

## Example 3: Component Splitting Pattern

### ❌ BEFORE: 7,459-line Monolith
```javascript
// BankingAgent.js
export default function BankingAgent() {
  // 60 useState
  // 100+ functions
  // 7,459 lines of JSX
  // ...
  return (
    <div className="banking-agent">
      {/* messages list, 500+ lines */}
      <div className="messages">
        {messages.map(msg => (
          <div className={`msg msg-${msg.role}`}>
            {msg.content}
          </div>
        ))}
      </div>

      {/* input area, 200+ lines */}
      <div className="input-area">
        <input value={input} onChange={handleInputChange} />
        <button onClick={handleSend}>Send</button>
      </div>

      {/* compliance panel, 300+ lines */}
      <div className="compliance">
        {/* ... */}
      </div>

      {/* ... 50+ more sections ... */}
    </div>
  );
}
```

### ✅ AFTER: Component Hierarchy
```javascript
// BankingAgent.jsx (100 lines - just orchestration)
/**
 * Root Banking Agent component
 * Orchestrates chat UI, tools, and compliance flow
 */
export default function BankingAgent() {
  const { isOpen, toggleOpen } = useAgentStore();

  return (
    <div className="banking-agent">
      <Header onToggle={toggleOpen} isOpen={isOpen} />
      {isOpen && (
        <>
          <ChatPanel />
          <InputArea />
          <CompliancePanel />
        </>
      )}
    </div>
  );
}

// components/ChatPanel.jsx (150 lines)
/**
 * Displays message history with auto-scroll
 * @component
 */
function ChatPanel() {
  const { messages } = useAgentStore();
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="chat-panel" role="log" aria-label="Chat messages">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
}

// components/InputArea.jsx (120 lines)
/**
 * User input box with send button and action chips
 * @component
 */
function InputArea() {
  const [input, setInput] = useState('');
  const { addMessage, setLoading } = useAgentStore();

  const handleSend = useCallback(async () => {
    if (!input.trim()) return;
    
    addMessage('user', input);
    setInput('');
    
    try {
      setLoading(true);
      const response = await callAgent(input);
      addMessage('assistant', response);
    } finally {
      setLoading(false);
    }
  }, [input, addMessage, setLoading]);

  return (
    <div className="input-area">
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyPress={(e) => e.key === 'Enter' && handleSend()}
        placeholder="Ask me anything..."
        aria-label="Agent input"
      />
      <button onClick={handleSend} aria-label="Send message">
        Send
      </button>
    </div>
  );
}

// components/MessageBubble.jsx (80 lines)
/**
 * Single chat message with formatting
 * @component
 * @param {Object} message - Message object
 * @param {string} message.role - 'user' or 'assistant'
 * @param {string} message.content - Message text
 */
function MessageBubble({ message }) {
  return (
    <div className={`bubble bubble-${message.role}`}>
      {message.content}
    </div>
  );
}

// components/CompliancePanel.jsx (200 lines)
/**
 * Displays 12-step compliance checklist
 * @component
 */
function CompliancePanel() {
  const { compliance } = useAgentStore();
  
  return (
    <div className="compliance-panel">
      {STEPS.map((step, i) => (
        <Step
          key={i}
          step={step}
          completed={compliance[step]}
        />
      ))}
    </div>
  );
}

export { ChatPanel, InputArea, CompliancePanel };
```

**Benefits:**
- Each component <200 LOC
- Easy to test individually
- Reusable in other contexts
- Easy to understand
- Easy to maintain
- Performance: can memoize individual components

---

## Example 4: Error Handling with Fallback

### ❌ BEFORE: No Error Handling
```javascript
function MyComponent() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch('/api/data')
      .then(res => res.json())
      .then(setData);
    // No error handling!
  }, []);

  return <div>{data?.name}</div>;
}
```

### ✅ AFTER: Full Error Handling
```javascript
/**
 * Component with comprehensive error handling
 * @component
 */
function MyComponent() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/data', {
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(
            `Failed to fetch: ${res.status} ${res.statusText}`
          );
        }

        const json = await res.json();
        setData(json);
        setError(null);
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('Fetch error:', err);
          setError(err);
        }
      } finally {
        setLoading(false);
      }
    })();

    return () => controller.abort();
  }, []);

  // Render states
  if (loading) return <Spinner />;
  if (error) return <ErrorMessage error={error} />;
  if (!data) return <Empty />;

  return <div>{data.name}</div>;
}

// Reusable hook
/**
 * Hook for fetching data with loading/error states
 * @param {string} url - API endpoint
 * @returns {Object} { data, error, loading }
 */
export function useFetch(url) {
  const [state, dispatch] = useReducer(
    (state, action) => ({ ...state, ...action }),
    { data: null, error: null, loading: true }
  );

  useEffect(() => {
    const controller = new AbortController();

    fetch(url, { signal: controller.signal })
      .then(res => res.ok ? res.json() : Promise.reject(res))
      .then(data => dispatch({ data, error: null, loading: false }))
      .catch(error => {
        if (error.name !== 'AbortError') {
          dispatch({ error, data: null, loading: false });
        }
      });

    return () => controller.abort();
  }, [url]);

  return state;
}

// Usage
function Component() {
  const { data, error, loading } = useFetch('/api/accounts');
  
  if (loading) return <Spinner />;
  if (error) return <Error />;
  return <View data={data} />;
}
```

**Benefits:**
- Covers all states: loading, success, error
- Request cancellation prevents leaks
- Reusable hook pattern
- Clear error messages

---

## Summary Table: Before vs After

| Aspect | Before | After |
|--------|--------|-------|
| **Lines of Code** | 7,459 | 150 (root) + 80-200 per sub-component |
| **useState hooks** | 60 | 1-3 per component + Zustand store |
| **Testability** | 😞 Hard | 😊 Easy |
| **Reusability** | 😞 Low | 😊 High |
| **Performance** | ⚠️ At-risk | ✅ Optimized |
| **Error Handling** | ❌ None | ✅ Complete |
| **Type Safety** | ❌ None | ✅ TypeScript ready |
| **Documentation** | ❌ Minimal | ✅ JSDoc everywhere |

---

**Next Step:** Pick one component and refactor using these patterns. Start small, measure impact, iterate.
