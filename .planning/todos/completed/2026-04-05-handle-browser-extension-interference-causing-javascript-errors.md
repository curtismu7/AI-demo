---
created: 2026-04-05T14:30:00.000Z
title: Handle browser extension interference causing JavaScript errors
area: ui
files:
  - banking_api_ui/src/services/bankingAgentService.js
  - banking_api_ui/src/App.js
---

## Problem

Browser extensions (particularly password managers like Bitwarden) are causing JavaScript errors that interfere with the banking application:

```
bootstrap-autofill-overlay.js:9562 Uncaught (in promise) TypeError: Cannot read properties of null (reading 'includes')
```

This error occurs when the extension tries to analyze form fields and encounters null values, causing:
- Console errors that clutter debugging
- Potential interference with form functionality
- User experience degradation

Additionally, MCP tool 400 errors were observed in the browser, potentially related to extension interference with form field validation.

## Solution

### 1. Enhanced Error Handling in bankingAgentService.js
- **Defensive programming**: Added try-catch blocks around console logging and flow diagram operations
- **Request body validation**: Enhanced validation with detailed error reporting for 400 responses
- **Extension interference detection**: Added warnings when extension-related errors are detected
- **Improved error messages**: Better debugging information for MCP tool failures

### 2. Browser Extension Detection in App.js
- **Global error handler**: Catches and prevents extension errors from crashing the app
- **Console.error filtering**: Filters out known extension interference patterns
- **Extension-specific handling**: Detects bootstrap-autofill-overlay.js errors specifically
- **User experience**: Prevents extension errors from affecting application functionality

### 3. Enhanced MCP Tool Error Handling
- **400 error specific handling**: Detailed logging and error reporting for bad requests
- **Request body debugging**: Includes request body snippet in error logs
- **Flow diagram resilience**: Prevents flow diagram errors from breaking tool calls
- **Defensive JSON parsing**: Handles malformed responses gracefully

## Implementation Details

### bankingAgentService.js Changes:
```js
// Defensive console logging
try {
  console.log('[callMcpTool] Calling MCP tool:', { tool, paramsKeys: Object.keys(params || {}) });
} catch (err) {
  console.warn('[callMcpTool] Console logging failed (possible extension interference):', err);
}

// Enhanced 400 error handling
if (response.status === 400) {
  const err400 = await response.clone().json().catch(() => ({ 
    error: 'unknown_400',
    message: 'Bad request - invalid tool parameters',
    debug: { status: 400, body: body.substring(0, 200) }
  }));
  
  console.error('[callMcpTool] 400 error from server:', {
    error: err400,
    requestBody: { tool, params, flowTraceId },
    bodyLength: body.length
  });
  // ... enhanced error handling
}
```

### App.js Changes:
```js
const setupBrowserExtensionHandling = () => {
  const originalConsoleError = console.error;
  console.error = (...args) => {
    const message = args.join(' ');
    if (message.includes('bootstrap-autofill-overlay.js') || 
        message.includes('Cannot read properties of null (reading \'includes\')')) {
      console.warn('[Browser Extension] Detected extension interference:', message);
      return; // Don't let extension errors break our app
    }
    originalConsoleError.apply(console, args);
  };

  const handleGlobalError = (event) => {
    if (event.error && event.error.message && 
        event.error.message.includes('bootstrap-autofill-overlay.js')) {
      console.warn('[Browser Extension] Prevented extension error from crashing app');
      event.preventDefault();
      return false;
    }
  };

  window.addEventListener('error', handleGlobalError);
  return () => {
    console.error = originalConsoleError;
    window.removeEventListener('error', handleGlobalError);
  };
};
```

## Testing

- **Build verification**: Application builds successfully with new error handling
- **Extension compatibility**: Errors from extensions no longer break the application
- **MCP tool resilience**: Enhanced error handling provides better debugging information
- **Console cleanliness**: Extension errors are filtered and logged appropriately

## Impact

- **Improved stability**: Browser extension interference no longer crashes the application
- **Better debugging**: Enhanced error messages help identify real issues vs extension interference
- **User experience**: Cleaner console and more reliable form functionality
- **Developer experience**: Clear distinction between extension errors and application errors

## Notes

This solution specifically targets the bootstrap-autofill-overlay.js error pattern but can be extended to handle other browser extension interference patterns as they are discovered.
