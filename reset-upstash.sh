#!/usr/bin/env bash
# reset-upstash.sh — delete old Upstash DB, create fresh one, update Vercel, redeploy
set -e

echo ""
echo "======================================================"
echo "  Upstash Redis Reset + Vercel Redeploy"
echo "======================================================"
echo ""
echo "You need your Upstash API key."
echo "Get it at: https://console.upstash.com/account/api-keys"
echo ""

read -p "Upstash account email:  " UPSTASH_EMAIL
read -p "Upstash API key:        " UPSTASH_API_KEY

# Strip any accidental whitespace/newlines from pasted values
UPSTASH_EMAIL=$(echo "$UPSTASH_EMAIL" | tr -d '[:space:]')
UPSTASH_API_KEY=$(echo "$UPSTASH_API_KEY" | tr -d '[:space:]')

AUTH=$(printf '%s:%s' "$UPSTASH_EMAIL" "$UPSTASH_API_KEY" | base64)

# ── 1. Find existing database ─────────────────────────────────────────────────
echo ""
echo "Fetching your Upstash databases..."
DATABASES=$(curl -sf -H "Authorization: Basic $AUTH" https://api.upstash.com/v2/redis/databases)

DB_COUNT=$(echo "$DATABASES" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))")
echo "Found $DB_COUNT database(s):"
echo "$DATABASES" | python3 -c "
import json, sys
for db in json.load(sys.stdin):
    print(f'  id={db[\"database_id\"]}  name={db[\"database_name\"]}  region={db[\"region\"]}')
"

# Pick the first (or only) DB id automatically
OLD_DB_ID=$(echo "$DATABASES" | python3 -c "
import json, sys
dbs = json.load(sys.stdin)
print(dbs[0]['database_id'] if dbs else '')
")

# ── 2. Delete old database ────────────────────────────────────────────────────
if [ -n "$OLD_DB_ID" ]; then
  echo ""
  echo "Deleting database $OLD_DB_ID ..."
  DEL=$(curl -sf -X DELETE -H "Authorization: Basic $AUTH" \
    "https://api.upstash.com/v2/redis/database/$OLD_DB_ID")
  echo "  Deleted: $DEL"
else
  echo "  No existing database found — skipping delete."
fi

# ── 3. Create fresh database ──────────────────────────────────────────────────
DB_NAME="banking-demo-$(date +%Y%m%d)"
echo ""
echo "Creating new database: $DB_NAME ..."
NEW_DB=$(curl -sf -X POST \
  -H "Authorization: Basic $AUTH" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$DB_NAME\",\"region\":\"us-east-1\",\"tls\":true}" \
  https://api.upstash.com/v2/redis/database)

REST_URL=$(echo "$NEW_DB" | python3 -c "import json,sys; print(json.load(sys.stdin)['rest_url'])")
REST_TOKEN=$(echo "$NEW_DB" | python3 -c "import json,sys; print(json.load(sys.stdin)['rest_token'])")
READ_ONLY_TOKEN=$(echo "$NEW_DB" | python3 -c "import json,sys; print(json.load(sys.stdin)['read_only_rest_token'])")

if [ -z "$REST_URL" ] || [ "$REST_URL" = "None" ]; then
  echo "ERROR: Failed to create database. Full response:"
  echo "$NEW_DB"
  exit 1
fi
echo "  REST URL: $REST_URL"
echo "  (tokens hidden)"

# ── 4. Remove old Vercel env vars ─────────────────────────────────────────────
echo ""
echo "Removing old Vercel env vars..."
for VAR in KV_REST_API_URL KV_REST_API_TOKEN KV_REST_API_READ_ONLY_TOKEN; do
  npx vercel env rm "$VAR" production --yes 2>/dev/null \
    && echo "  Removed $VAR" \
    || echo "  $VAR not present (skipping)"
done

# ── 5. Set new Vercel env vars ────────────────────────────────────────────────
echo ""
echo "Setting new Vercel env vars..."
printf '%s' "$REST_URL"        | npx vercel env add KV_REST_API_URL             production && echo "  Added KV_REST_API_URL"
printf '%s' "$REST_TOKEN"      | npx vercel env add KV_REST_API_TOKEN            production && echo "  Added KV_REST_API_TOKEN"
printf '%s' "$READ_ONLY_TOKEN" | npx vercel env add KV_REST_API_READ_ONLY_TOKEN  production && echo "  Added KV_REST_API_READ_ONLY_TOKEN"

# ── 6. Redeploy ───────────────────────────────────────────────────────────────
echo ""
echo "Deploying to Vercel production..."
npx vercel --prod

echo ""
echo "======================================================"
echo "  Done!"
echo "  Sign OUT of the app, then sign back IN."
echo "  Check debug panel: sessionStoreHealthy should be true."
echo "======================================================"
