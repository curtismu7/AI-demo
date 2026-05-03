# JSDoc Guide for banking_api_ui

**Purpose:** Document all public functions with JSDoc comments for IDE autocomplete, type hints, and maintainability.

---

## Basic JSDoc Format

```javascript
/**
 * Brief description of what the function does
 * 
 * Longer description explaining behavior, side effects, or important details.
 * Can span multiple lines and include examples.
 *
 * @param {type} paramName - Description of parameter
 * @param {type} [optionalParam] - Optional parameter (note the square brackets)
 * @returns {type} Description of return value
 * @throws {ErrorType} When/why this error is thrown
 * 
 * @example
 * // Usage example
 * const result = myFunction(arg1, arg2);
 */
function myFunction(paramName, optionalParam) {
  // Implementation
}
```

---

## Common Type Annotations

| Type | Syntax | Example |
|------|--------|---------|
| String | `{string}` | `{string} name - User name` |
| Number | `{number}` | `{number} count - Item count` |
| Boolean | `{boolean}` | `{boolean} enabled - Feature flag` |
| Array | `{Array<type>}` | `{Array<string>} names - List of names` |
| Object | `{Object}` | `{Object} config - Configuration` |
| Function | `{Function}` | `{Function} callback - Callback function` |
| Union | `{type1\|type2}` | `{string\|number} id - User ID` |
| Optional | `{type}` in brackets | `{string} [optional] - Optional param` |
| Any | `{*}` | `{*} data - Any value` |

---

## Real Examples from banking_api_ui

### Example 1: Simple Utility Function

```javascript
/**
 * Format currency amount for display
 * 
 * @param {number} amount - Amount in cents (1000 = $10.00)
 * @param {string} [currency='USD'] - Currency code (default: USD)
 * @returns {string} Formatted currency string (e.g., "$10.00")
 * 
 * @example
 * const formatted = formatCurrency(1000);
 * // Returns: "$10.00"
 * 
 * const eur = formatCurrency(5000, 'EUR');
 * // Returns: "€50.00"
 */
export function formatCurrency(amount, currency = 'USD') {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
  });
  return formatter.format(amount / 100);
}
```

### Example 2: React Component

```javascript
/**
 * Display a single transaction in list
 * 
 * @component
 * @param {Object} props - Component props
 * @param {Object} props.transaction - Transaction object
 * @param {string} props.transaction.id - Transaction ID
 * @param {number} props.transaction.amount - Amount in cents
 * @param {string} props.transaction.type - Type (debit, credit, transfer)
 * @param {string} props.transaction.description - Transaction description
 * @param {Function} props.onSelect - Callback when transaction is clicked
 * @returns {React.ReactElement} Rendered transaction item
 * 
 * @example
 * <TransactionItem 
 *   transaction={txn}
 *   onSelect={(id) => console.log('Selected:', id)}
 * />
 */
export function TransactionItem({ transaction, onSelect }) {
  return (
    <div onClick={() => onSelect(transaction.id)}>
      {transaction.description}: {formatCurrency(transaction.amount)}
    </div>
  );
}
```

### Example 3: Hook with Error Handling

```javascript
/**
 * Fetch data from API with loading/error states
 * 
 * Automatically cancels in-flight requests if component unmounts.
 * Uses AbortController to prevent memory leaks.
 *
 * @param {string} url - API endpoint to fetch
 * @param {Object} [options={}] - Fetch options
 * @param {string} [options.method='GET'] - HTTP method
 * @param {Object} [options.headers] - HTTP headers
 * @param {boolean} [options.skip=false] - Skip fetch if true
 * @returns {Object} Fetch state
 * @returns {*} data - Fetched data (null while loading)
 * @returns {Error} error - Error if fetch failed
 * @returns {boolean} loading - True while fetching
 * @returns {Function} refetch - Function to retry fetch
 * 
 * @throws {AbortError} When component unmounts during fetch
 * 
 * @example
 * function MyComponent() {
 *   const { data, error, loading } = useFetch('/api/accounts');
 *   
 *   if (loading) return <Spinner />;
 *   if (error) return <Error message={error.message} />;
 *   return <View accounts={data} />;
 * }
 */
export function useFetch(url, options = {}) {
  // Implementation
}
```

### Example 4: Async Function with Multiple Parameters

```javascript
/**
 * Process transaction and send to backend
 * 
 * Validates transaction data, sends to API, and updates local state.
 * Requires user to be authenticated.
 *
 * @async
 * @param {Object} transaction - Transaction details
 * @param {string} transaction.type - Type: 'transfer', 'withdraw', 'deposit'
 * @param {number} transaction.amount - Amount in cents
 * @param {string} transaction.fromAccount - From account ID
 * @param {string} transaction.toAccount - To account ID
 * @param {string} [transaction.memo] - Transaction memo
 * @returns {Promise<Object>} Server response with transaction ID
 * @returns {string} transactionId - Unique transaction ID from server
 * @returns {Object} receipt - Transaction receipt data
 * 
 * @throws {ValidationError} If transaction data is invalid
 * @throws {APIError} If server returns error (insufficient funds, etc.)
 * @throws {AuthError} If user is not authenticated
 * 
 * @example
 * try {
 *   const result = await processTransaction({
 *     type: 'transfer',
 *     amount: 10000,
 *     fromAccount: 'acc-123',
 *     toAccount: 'acc-456',
 *   });
 *   console.log('Transaction ID:', result.transactionId);
 * } catch (error) {
 *   console.error('Transaction failed:', error.message);
 * }
 */
export async function processTransaction(transaction) {
  // Implementation
}
```

---

## Priority Files for JSDoc

**HIGH PRIORITY** (Public APIs, frequently reused):
- `src/services/safeFetch.js` ✅ Done
- `src/services/errorTracking.js` ✅ Done
- `src/services/performanceMonitoring.js` ✅ Done
- `src/utils/withMemo.js` ✅ Done
- `src/utils/useEffectCleanup.js` ✅ Done
- `src/utils/*.js` (all utility functions)
- `src/services/*.js` (all services)

**MEDIUM PRIORITY** (Component props, reusable components):
- `src/components/*.jsx` (all exported components)
- `src/context/*.js` (context providers)
- `src/hooks/*.js` (custom hooks)

**LOW PRIORITY** (Internal utilities, rarely exported):
- Local helper functions
- Private components
- Internal test utilities

---

## IDE Setup

### VS Code with JSDoc

1. **Hover over function to see JSDoc:**
   - JSDoc appears in autocomplete popup
   - Shows parameter types and descriptions

2. **Enable type checking (optional):**
   - Add comment at file top: `// @ts-check`
   - VS Code will validate types against JSDoc

3. **Generate JSDoc skeleton:**
   - Type `/**` above function and press Enter
   - VS Code auto-fills JSDoc template

### WebStorm/IntelliJ

1. **Hover over function** → JSDoc auto-displayed
2. **Generate JSDoc:** Place cursor on function → Alt+Enter → "Generate JSDoc"
3. **Type inference:** IDE automatically detects types from code

---

## Automated Validation

### ESLint Plugin

```bash
npm install --save-dev eslint-plugin-jsdoc
```

**Configuration (.eslintrc.json):**
```json
{
  "extends": ["plugin:jsdoc/recommended"],
  "rules": {
    "jsdoc/require-param-description": "warn",
    "jsdoc/require-returns-description": "warn",
    "jsdoc/no-undefined-types": "warn"
  }
}
```

### Build-Time Validation

```bash
npm install --save-dev jsdoc tsd-jsdoc
npm run build:docs  # Generate documentation
```

---

## Guidelines

### DO ✅

- Write concise descriptions (1 line for brief, paragraph for complex)
- Include `@param` and `@returns` for all public functions
- Use `@example` for non-obvious functions
- Document thrown errors with `@throws`
- Document side effects (API calls, state mutations)
- Use proper type annotations (not just `{Object}`)

### DON'T ❌

- Repeat the function name in description
- Document implementation details (only behavior)
- Use unclear abbreviations
- Leave `@param` or `@returns` undocumented
- Write essays — keep it scannable

---

## Batch Documentation

**Script to add JSDoc stubs** (manual completion required):
```javascript
// Find functions lacking JSDoc:
grep -B1 "^export function\|^const.*=.*=>" src/**/*.js | grep -v "^--$"
```

**Process:**
1. Identify undocumented functions
2. Add JSDoc stub with author comment
3. Test in IDE (autocomplete works)
4. Fill in descriptions

---

## Benefits

- ✅ **IDE Autocomplete:** Shows parameter types and documentation while coding
- ✅ **Refactoring Safety:** Type hints catch breaking changes early
- ✅ **Onboarding:** New developers understand APIs instantly
- ✅ **Documentation:** Can generate HTML docs from JSDoc
- ✅ **Type Checking:** Optional static type validation without TypeScript

---

## Quick Wins Summary

**Files with JSDoc already added:**
- ✅ `safeFetch.js` — Safe fetch utility
- ✅ `errorTracking.js` — Sentry integration
- ✅ `performanceMonitoring.js` — Web Vitals
- ✅ `withMemo.js` — Memoization utility
- ✅ `useEffectCleanup.js` — Cleanup hooks
- ✅ `ErrorBoundary.jsx` — Error fallback

**Next: Apply template above to:**
1. All `src/services/*.js` files
2. All `src/utils/*.js` files
3. All `src/hooks/*.js` files
4. All exported components

---

**Target:** Every public function with JSDoc by end of sprint.
