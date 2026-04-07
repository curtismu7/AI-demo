#!/bin/bash

# Quick Vercel Environment Variables Restoration - Critical Variables Only
# This script restores the minimum required environment variables to fix 500 errors

set -e

echo "🚨 Quick Restore: Critical Vercel Environment Variables"
echo "📁 Working directory: $(pwd)"

# Check if we're in the right directory
if [ ! -f "banking_api_server/server.js" ]; then
    echo "❌ Error: Please run from project root directory"
    exit 1
fi

# Function to add environment variable
add_env_var() {
    local var_name="$1"
    local var_value="$2"
    local var_type="${3:-secret}"
    
    echo "📝 Adding $var_name..."
    
    # Remove if exists
    vercel env rm "$var_name" --environment=production --yes 2>/dev/null || true
    
    # Add new
    echo "$var_value" | vercel env add "$var_name" --environment=production --type=$var_type
}

echo ""
echo "🔐 Adding Critical PingOne Variables..."

# Read from local .env if it exists
if [ -f "banking_api_server/.env" ]; then
    echo "📖 Reading from local .env file..."
    
    # Extract critical variables
    PINGONE_ENVIRONMENT_ID=$(grep "^PINGONE_ENVIRONMENT_ID=" banking_api_server/.env | cut -d'=' -f2- | tr -d '\r' || echo "")
    PINGONE_CORE_CLIENT_ID=$(grep "^PINGONE_CORE_CLIENT_ID=" banking_api_server/.env | cut -d'=' -f2- | tr -d '\r' || echo "")
    PINGONE_CORE_CLIENT_SECRET=$(grep "^PINGONE_CORE_CLIENT_SECRET=" banking_api_server/.env | cut -d'=' -f2- | tr -d '\r' || echo "")
    PINGONE_CORE_USER_CLIENT_ID=$(grep "^PINGONE_CORE_USER_CLIENT_ID=" banking_api_server/.env | cut -d'=' -f2- | tr -d '\r' || echo "")
    PINGONE_CORE_USER_CLIENT_SECRET=$(grep "^PINGONE_CORE_USER_CLIENT_SECRET=" banking_api_server/.env | cut -d'=' -f2- | tr -d '\r' || echo "")
    SESSION_SECRET=$(grep "^SESSION_SECRET=" banking_api_server/.env | cut -d'=' -f2- | tr -d '\r' || echo "")
    
    # Add variables if found
    [ -n "$PINGONE_ENVIRONMENT_ID" ] && add_env_var "PINGONE_ENVIRONMENT_ID" "$PINGONE_ENVIRONMENT_ID" "plain"
    [ -n "$PINGONE_CORE_CLIENT_ID" ] && add_env_var "PINGONE_CORE_CLIENT_ID" "$PINGONE_CORE_CLIENT_ID" "secret"
    [ -n "$PINGONE_CORE_CLIENT_SECRET" ] && add_env_var "PINGONE_CORE_CLIENT_SECRET" "$PINGONE_CORE_CLIENT_SECRET" "secret"
    [ -n "$PINGONE_CORE_USER_CLIENT_ID" ] && add_env_var "PINGONE_CORE_USER_CLIENT_ID" "$PINGONE_CORE_USER_CLIENT_ID" "secret"
    [ -n "$PINGONE_CORE_USER_CLIENT_SECRET" ] && add_env_var "PINGONE_CORE_USER_CLIENT_SECRET" "$PINGONE_CORE_USER_CLIENT_SECRET" "secret"
    [ -n "$SESSION_SECRET" ] && add_env_var "SESSION_SECRET" "$SESSION_SECRET" "secret"
    
else
    echo "⚠️  No .env file found. Please enter values manually:"
    
    # Prompt for critical values
    read -p "PINGONE_ENVIRONMENT_ID: " PINGONE_ENVIRONMENT_ID
    read -p "PINGONE_CORE_CLIENT_ID: " PINGONE_CORE_CLIENT_ID
    read -p "PINGONE_CORE_CLIENT_SECRET: " PINGONE_CORE_CLIENT_SECRET
    read -p "PINGONE_CORE_USER_CLIENT_ID: " PINGONE_CORE_USER_CLIENT_ID
    read -p "PINGONE_CORE_USER_CLIENT_SECRET: " PINGONE_CORE_USER_CLIENT_SECRET
    read -p "SESSION_SECRET: " SESSION_SECRET
    
    # Add manually entered values
    add_env_var "PINGONE_ENVIRONMENT_ID" "$PINGONE_ENVIRONMENT_ID" "plain"
    add_env_var "PINGONE_CORE_CLIENT_ID" "$PINGONE_CORE_CLIENT_ID" "secret"
    add_env_var "PINGONE_CORE_CLIENT_SECRET" "$PINGONE_CORE_CLIENT_SECRET" "secret"
    add_env_var "PINGONE_CORE_USER_CLIENT_ID" "$PINGONE_CORE_USER_CLIENT_ID" "secret"
    add_env_var "PINGONE_CORE_USER_CLIENT_SECRET" "$PINGONE_CORE_USER_CLIENT_SECRET" "secret"
    add_env_var "SESSION_SECRET" "$SESSION_SECRET" "secret"
fi

echo ""
echo "🌐 Adding URL Configuration..."

# Add required URL configuration
add_env_var "FRONTEND_ADMIN_URL" "https://banking-ui.vercel.app" "plain"
add_env_var "FRONTEND_DASHBOARD_URL" "https://banking-ui.vercel.app" "plain"
add_env_var "REACT_APP_CLIENT_URL" "https://banking-ui.vercel.app" "plain"
add_env_var "PUBLIC_APP_URL" "https://banking-api-server.vercel.app" "plain"

echo ""
echo "⚙️ Adding Server Configuration..."

# Add server configuration
add_env_var "NODE_ENV" "production" "plain"
add_env_var "PORT" "3001" "plain"

echo ""
echo "🔍 Adding Optional Configuration..."

# Add optional but helpful configuration
add_env_var "DEBUG_OAUTH" "false" "plain"
add_env_var "DEBUG_TOKENS" "false" "plain"
add_env_var "STEP_UP_AMOUNT_THRESHOLD" "250" "plain"
add_env_var "CIBA_ENABLED" "false" "plain"

echo ""
echo "✅ Critical environment variables restored!"
echo ""
echo "📋 Current environment variables:"
vercel env ls --environment=production
echo ""
echo "🚀 Now redeploy your application:"
echo "   vercel --prod"
echo ""
echo "💡 For full restoration, run: ./scripts/restore-vercel-env.sh"
