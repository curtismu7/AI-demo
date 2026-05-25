---
title: Add SKIP_TOKEN_SIGNATURE_VALIDATION production startup guard
date: 2026-05-25
priority: low
phase: 279
---

## Problem

`SKIP_TOKEN_SIGNATURE_VALIDATION=true` env var exists and the LangChain agent's config classes inherit it. If accidentally set in a non-dev environment, JWT tokens pass validation without signature checks — a silent security bypass.

## Fix

Add a startup guard that raises `RuntimeError` if the flag is enabled outside development:

```python
# In langchain_agent/config/settings.py or startup main.py
if settings.skip_token_signature_validation and settings.environment != "development":
    raise RuntimeError(
        "SKIP_TOKEN_SIGNATURE_VALIDATION=true is not permitted outside development environments. "
        "Unset this variable before starting in staging or production."
    )
```

## Files affected

- `langchain_agent/config/settings.py` — add guard on `Settings.__post_init__` or `validate_settings()`
- `langchain_agent/src/api/websocket_handler.py` or `main.py` — ensure guard fires at startup

## Additional

Also verify: session→user binding is enforced at session creation (not just authentication). Banking tool results that land in memory must not be accessible to a different session ID.

## Phase

Planned as Phase 279.
