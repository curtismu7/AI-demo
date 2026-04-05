---
description: GSD Restart - Restart server and rebuild
---

# GSD Restart Workflow

## Purpose
Clean restart of development server and rebuild of application to ensure fresh state.

## When to Use
- After configuration changes
- When server behaves unexpectedly
- After dependency updates
- Before testing major changes
- When environment issues suspected

## Steps

### 1. Clean Shutdown
// turbo
Stop all running processes cleanly:
```bash
pkill -f "node.*server.js" || true
pkill -f "react-scripts" || true
sleep 2
```

### 2. Clean Dependencies
- **Clear**: Remove node_modules if needed
- **Install**: Fresh dependency installation
- **Verify**: Check for installation errors

### 3. Clean Build
- **Remove**: Delete build artifacts
- **Build**: Fresh application build
- **Verify**: Check build success

### 4. Server Restart
- **Start**: Fresh server instance
- **Monitor**: Check startup logs
- **Verify**: Confirm server health

### 5. Validation
- **Test**: Basic functionality test
- **Check**: Error-free startup
- **Confirm**: Ready for development

## Expected Outcome
- Clean server restart
- Fresh application state
- No cached issues
- Verified functionality

## Notes
- Allow adequate time for shutdown
- Monitor startup logs for errors
- Test basic endpoints
- Document any issues found
