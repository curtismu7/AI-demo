---
description: GSD Quick - Fast fixes for simple issues
---

# GSD Quick Workflow

## Purpose
Rapid resolution of simple, well-defined issues that don't require extensive investigation or complex changes.

## When to Use
- Simple bug fixes with clear root cause
- Typos and minor text corrections
- Configuration adjustments
- Small UI improvements
- Documentation updates
- Low-risk code changes

## Steps

### 1. Issue Assessment
// turbo
Quick validation that the issue is simple and well-understood:
```bash
echo "Assessing issue complexity..."
```

### 2. Minimal Fix Implementation
- **Identify**: Locate the exact code needing change
- **Implement**: Make the minimal change required
- **Test**: Verify the fix works immediately
- **Document**: Add minimal documentation if needed

### 3. Quick Verification
- **Build**: Ensure code compiles/builds successfully
- **Function**: Test the specific functionality
- **Regression**: Quick check for obvious side effects

### 4. Commit and Move On
- **Commit**: Use clear, descriptive commit message
- **Update**: Move todo to completed if applicable
- **Proceed**: Return to next priority task

## Expected Outcome
- Fast resolution of simple issues
- Minimal code changes
- No regressions
- Clear documentation of changes

## Notes
- Time limit: 15 minutes maximum per issue
- If issue becomes complex, switch to /gsd-debug
- Always test before committing
- Keep changes minimal and focused
