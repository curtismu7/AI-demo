---
phase: 279
plan: 01
status: complete
completed_at: "2026-05-25"
commits:
  - 9ab9753a feat(279-01): add SKIP_TOKEN_SIGNATURE_VALIDATION production guard to settings.py
  - 454a62ca feat(279): guard tests + REGRESSION_PLAN §4 entry
---

# Phase 279 Plan 01 — Summary

## What was done

Added a startup `RuntimeError` guard to the Python langchain_agent that refuses to start if `SKIP_TOKEN_SIGNATURE_VALIDATION=true` is set outside development/test environments. Closes parity gap with the Node.js BFF guard (`server.js` line 42).

### Task 1 — Guard in settings.py
In `ConfigManager.validate_environment_config()`, added before `env_config.validate_config(config)`:
```python
skip_sig = os.environ.get("SKIP_TOKEN_SIGNATURE_VALIDATION", "").lower() == "true"
if skip_sig and config.environment not in {"development", "test"}:
    raise RuntimeError(
        "SKIP_TOKEN_SIGNATURE_VALIDATION=true is not permitted outside development "
        f"environments (current environment: {config.environment!r}). "
        "Unset this variable before starting in staging or production."
    )
```
Guard fires before any request is served. Minimal diff — no other lines touched.

### Task 2 — Tests + REGRESSION_PLAN
- `TestSkipTokenSignatureValidationGuard` (4 tests) appended to `test_config_settings.py`:
  - `test_guard_fires_in_staging` — RuntimeError raised ✅
  - `test_guard_fires_in_production` — RuntimeError raised ✅
  - `test_guard_allows_development` — no guard RuntimeError ✅
  - `test_guard_absent_when_flag_false` — no guard RuntimeError ✅
- `REGRESSION_PLAN.md §4`: [279] entry added at top with guard fix + session binding verification finding (no code change needed — `session_manager.create_session()` already binds `user_id` at construction time from validated PingOne token `sub`)

## Verification

```
✅ settings.py: validate_environment_config raises RuntimeError for staging/production + flag=true
✅ No error for development/test or when flag is false/unset
✅ pytest tests/test_config_settings.py — 18 passed (14 existing + 4 new)
✅ REGRESSION_PLAN.md §4 contains [279] entry
```
