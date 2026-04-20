#!/usr/bin/env bash
# ============================================================================
# sync-vercel-env.sh — Add missing Vercel environment variables
# Generated 2026-04-15 from banking_api_server/.env
#
# Review each variable below, then run:
#   bash scripts/sync-vercel-env.sh
#
# After running, redeploy:
#   vercel --prod
# ============================================================================
#
# ⚠️  SECURITY WARNING ⚠️
# DO NOT COMMIT ACTUAL API KEYS, TOKENS, OR SECRETS TO THIS FILE!
# This file is tracked in git. Only commit placeholder/template values like:
#   - add_env "ANTHROPIC_API_KEY" "${ANTHROPIC_API_KEY}"
#   - add_env "PINGONE_ADMIN_TOKEN" "${PINGONE_ADMIN_TOKEN}"
#
# Never paste real secrets. Use environment variables or local-only .env.local instead.
# GitHub's secret scanning will block commits with exposed keys.
# ============================================================================
set -euo pipefail

# Helper: add env var to Vercel (Production scope) — skips if already set
add_env() {
  local name="$1" value="$2" scope="${3:-production}"
  echo "  → $name ($scope)"
  echo -n "$value" | vercel env add "$name" "$scope" 2>&1 | grep -v "^$" || true
}

echo "=== Syncing missing Vercel env vars ==="
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 1: CRITICAL — Two-Exchange Delegation (currently broken on Vercel)
# These were the root cause of "actor token invalid or expired" errors
# ─────────────────────────────────────────────────────────────────────────────
echo "--- Section 1: Two-Exchange Delegation (CRITICAL) ---"

# Exchange #1 target audience — validateTwoExchangeConfig() requires this
add_env "AI_AGENT_INTERMEDIATE_AUDIENCE" "https://ai-agent.pingdemo.com"

# Auth methods — PingOne AI_AGENT apps require client_secret_post
# Without these, code defaults to 'basic' which PingOne rejects
add_env "AI_AGENT_TOKEN_ENDPOINT_AUTH_METHOD" "post"
add_env "PINGONE_MCP_TOKEN_EXCHANGER_CC_AUTH_METHOD" "post"
add_env "PINGONE_TOKEN_EXCHANGE_AUTH_METHOD" "post"

# MCP Exchanger auth for exchange grant — currently 'basic' on Vercel,
# but the MCP Exchanger is an AI_AGENT type app that requires 'post' for CC,
# while the token exchange grant itself uses 'basic'. Keep this as 'basic'.
# (Already on Vercel but may need updating if the app type changed)
# add_env "MCP_EXCHANGER_TOKEN_ENDPOINT_AUTH_METHOD" "basic"

echo ""

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 2: Token validation — auth.js knownAudiences
# ─────────────────────────────────────────────────────────────────────────────
echo "--- Section 2: Token Validation ---"

# Banking API resource server audience — user tokens have aud=this value
# Without it, auth.js rejects all user tokens with "audience mismatch"
add_env "BANKING_API_RESOURCE_URI" "https://resource-server.pingdemo.com"

echo ""

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 3: Canonical credential names (preferred over legacy aliases)
# The aliases AGENT_OAUTH_CLIENT_ID/SECRET and AI_AGENT_CLIENT_ID/SECRET
# already exist on Vercel. These are the canonical PINGONE_* names
# that configStore.getEffective() checks first via envFallbackMap.
# ─────────────────────────────────────────────────────────────────────────────
echo "--- Section 3: Canonical PingOne App Credentials ---"

# AI Agent App (performs Exchange #1 in 2-exchange chain)
add_env "PINGONE_AI_AGENT_CLIENT_ID" "2533a614-fcb6-4ab9-82cc-9ab407f1dbda"
add_env "PINGONE_AI_AGENT_CLIENT_SECRET" "HE9OltugnWeGHbvLYYN05SzMvcW7EdviRIcYwE1v2usdm22H1VXcdvcwcTk59hkx"

# MCP Token Exchanger App (performs Exchange #2 in 2-exchange chain)
add_env "PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID" "6380065f-f328-41c2-81ed-1daeec811285"
add_env "PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_SECRET" "QKZm899I7kgHMG6KKJfeptO1aw1Si-yALyFMOf-2OGFvOE4iPWJ0xOwsX_WmSaLA"
add_env "PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_SCOPES" "openid banking:read banking:write banking:admin banking:sensitive banking:ai:agent"

# Worker Token App (PingOne Management API calls)
add_env "PINGONE_WORKER_TOKEN_CLIENT_ID" "95dc946f-5e0a-4a8b-a8ba-b587b244e005"
add_env "PINGONE_WORKER_TOKEN_CLIENT_SECRET" "Ee2YBEmqrBRdELuNDAh5SPL6T01_M~R9o7QMYHyjcWXwzHvhhlvdptZRH6A6_2g-"
add_env "PINGONE_WORKER_TOKEN_AUTH_METHOD" "basic"

echo ""

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 4: Resource URIs (canonical names matching configStore envFallbackMap)
# Some already exist under alias names; these are the preferred PINGONE_* names.
# ─────────────────────────────────────────────────────────────────────────────
echo "--- Section 4: Resource Server URIs ---"

add_env "PINGONE_RESOURCE_MCP_SERVER_URI" "https://mcp-server.pingdemo.com"
add_env "PINGONE_RESOURCE_MCP_GATEWAY_URI" "https://mcp-gateway.pingdemo.com"
add_env "PINGONE_RESOURCE_TWO_EXCHANGE_URI" "https://resource-server.pingdemo.com"
add_env "PINGONE_RESOURCE_AGENT_GATEWAY_URI" "https://agent-gateway.pingdemo.com"

echo ""

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 5: Exchange scopes
# ─────────────────────────────────────────────────────────────────────────────
echo "--- Section 5: Exchange Scopes ---"

add_env "MCP_TOKEN_EXCHANGE_SCOPES" "banking:read banking:write banking:mcp:invoke"

echo ""

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 6: LLM / Agent (Anthropic already on Preview/Dev, add Production)
# ─────────────────────────────────────────────────────────────────────────────
echo "--- Section 6: LLM Keys ---"

# Check: ANTHROPIC_API_KEY may already be on Production from earlier output
# Uncomment if needed (add your actual key as: sk-ant-v1-...)
# add_env "ANTHROPIC_API_KEY" "${ANTHROPIC_API_KEY}"

echo ""
echo "=== Done! ==="
echo ""
echo "Next steps:"
echo "  1. Review the output above for any errors"
echo "  2. Run: vercel env ls | wc -l   (should show ~55+ vars)"
echo "  3. Redeploy: vercel --prod"
echo "  4. Test: curl https://<your-vercel-url>/api/health"
