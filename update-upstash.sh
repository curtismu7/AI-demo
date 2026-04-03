#!/usr/bin/env bash
# update-upstash.sh — update Vercel env vars with existing Upstash REST credentials
# Use this when you already have a KV_REST_API_URL + KV_REST_API_TOKEN
# (e.g. from upstash.com → your database → "REST API" tab).
set -e

echo ""
echo "======================================================"
echo "  Upstash Credentials Update + Vercel Redeploy"
echo "======================================================"
echo ""
echo "Paste your Upstash REST credentials."
echo "Find them at: upstash.com → your database → REST API tab"
echo ""

read -r -p "KV_REST_API_URL   (e.g. https://xxx.upstash.io):  " REST_URL
read -r -p "KV_REST_API_TOKEN (long string):                   " REST_TOKEN

# Strip accidental whitespace/newlines
REST_URL=$(echo "$REST_URL" | tr -d '[:space:]')
REST_TOKEN=$(echo "$REST_TOKEN" | tr -d '[:space:]')

if [ -z "$REST_URL" ] || [ -z "$REST_TOKEN" ]; then
  echo "ERROR: Both URL and token are required."
  exit 1
fi

# Quick sanity-check — ping the database
echo ""
echo "Testing connection..."
PING_RESP=$(curl -s --max-time 8 "$REST_URL/ping" -H "Authorization: Bearer $REST_TOKEN" 2>&1)
if echo "$PING_RESP" | grep -q '"PONG"'; then
  echo "  Connection OK — Upstash responded with PONG"
else
  echo "  WARNING: Unexpected response: $PING_RESP"
  read -r -p "  Continue anyway? (y/N) " CONT
  case "$CONT" in
    [yY]*) ;;
    *) echo "Aborted."; exit 1 ;;
  esac
fi

# ── Remove old Vercel env vars ────────────────────────────────────────────────
echo ""
echo "Removing old Vercel env vars (production)..."
for VAR in KV_REST_API_URL KV_REST_API_TOKEN KV_REST_API_READ_ONLY_TOKEN; do
  vercel env rm "$VAR" production --yes 2>/dev/null \
    && echo "  Removed $VAR" \
    || echo "  $VAR not present (skipping)"
done

# ── Set new Vercel env vars ───────────────────────────────────────────────────
echo ""
echo "Setting new Vercel env vars..."
printf '%s' "$REST_URL"   | vercel env add KV_REST_API_URL   production && echo "  Added KV_REST_API_URL"
printf '%s' "$REST_TOKEN" | vercel env add KV_REST_API_TOKEN production && echo "  Added KV_REST_API_TOKEN"

# ── Redeploy ──────────────────────────────────────────────────────────────────
echo ""
echo "Deploying to Vercel production..."
vercel --prod

echo ""
echo "======================================================"
echo "  Done!"
echo "  Sign OUT of the app, then sign back IN."
echo "  The debug panel (/api/auth/debug) should show"
echo "  sessionStoreType: upstash-rest"
echo "======================================================"
