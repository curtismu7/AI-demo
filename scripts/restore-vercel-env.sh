#!/bin/bash

# Vercel Environment Variables Restoration Script
# Usage: ./scripts/restore-vercel-env.sh [environment]
# Environment: production, preview, development (default: production)

set -e

ENVIRONMENT=${1:-production}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "🔧 Restoring Vercel environment variables for: $ENVIRONMENT"
echo "📁 Project root: $PROJECT_ROOT"

# Check if we're in the right directory
if [ ! -f "$PROJECT_ROOT/banking_api_server/.env.example" ]; then
    echo "❌ Error: .env.example not found. Please run from project root."
    exit 1
fi

# Function to add environment variable to Vercel
add_env_var() {
    local var_name="$1"
    local var_value="$2"
    local var_type="${3:-secret}" # Default to secret for sensitive data
    
    echo "📝 Adding $var_name to Vercel ($ENVIRONMENT)..."
    
    # Check if variable already exists
    if vercel env ls --environment=$ENVIRONMENT | grep -q "$var_name"; then
        echo "⚠️  $var_name already exists, removing first..."
        vercel env rm "$var_name" --environment=$ENVIRONMENT --yes
    fi
    
    # Add the variable
    echo "$var_value" | vercel env add "$var_name" --environment=$ENVIRONMENT --type=$var_type
}

# Function to read value from .env file or prompt
get_env_value() {
    local var_name="$1"
    local prompt_text="$2"
    local default_value="$3"
    
    # Try to read from local .env file first
    if [ -f "$PROJECT_ROOT/banking_api_server/.env" ]; then
        local value=$(grep "^$var_name=" "$PROJECT_ROOT/banking_api_server/.env" | cut -d'=' -f2- | tr -d '\r')
        if [ -n "$value" ]; then
            echo "$value"
            return
        fi
    fi
    
    # Prompt user for value
    if [ -n "$default_value" ]; then
        read -p "$prompt_text [$default_value]: " value
        echo "${value:-$default_value}"
    else
        read -p "$prompt_text: " value
        echo "$value"
    fi
}

echo ""
echo "🔐 PingOne Core Configuration"

# Core PingOne Configuration
PINGONE_ENVIRONMENT_ID=$(get_env_value "PINGONE_ENVIRONMENT_ID" "PingOne Environment ID")
PINGONE_CORE_CLIENT_ID=$(get_env_value "PINGONE_CORE_CLIENT_ID" "Admin Client ID")
PINGONE_CORE_CLIENT_SECRET=$(get_env_value "PINGONE_CORE_CLIENT_SECRET" "Admin Client Secret")
PINGONE_CORE_USER_CLIENT_ID=$(get_env_value "PINGONE_CORE_USER_CLIENT_ID" "User Client ID")
PINGONE_CORE_USER_CLIENT_SECRET=$(get_env_value "PINGONE_CORE_USER_CLIENT_SECRET" "User Client Secret")

# Add core PingOne variables
add_env_var "PINGONE_ENVIRONMENT_ID" "$PINGONE_ENVIRONMENT_ID" "plain"
add_env_var "PINGONE_CORE_CLIENT_ID" "$PINGONE_CORE_CLIENT_ID" "secret"
add_env_var "PINGONE_CORE_CLIENT_SECRET" "$PINGONE_CORE_CLIENT_SECRET" "secret"
add_env_var "PINGONE_CORE_USER_CLIENT_ID" "$PINGONE_CORE_USER_CLIENT_ID" "secret"
add_env_var "PINGONE_CORE_USER_CLIENT_SECRET" "$PINGONE_CORE_USER_CLIENT_SECRET" "secret"

echo ""
echo "🔧 Server Configuration"

# Server configuration
SESSION_SECRET=$(get_env_value "SESSION_SECRET" "Session Secret (generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\")")
NODE_ENV=$(get_env_value "NODE_ENV" "Node Environment" "production")
PORT=$(get_env_value "PORT" "Port" "3001")

# Add server configuration
add_env_var "SESSION_SECRET" "$SESSION_SECRET" "secret"
add_env_var "NODE_ENV" "$NODE_ENV" "plain"
add_env_var "PORT" "$PORT" "plain"

echo ""
echo "🌐 URL Configuration"

# URL configuration
FRONTEND_ADMIN_URL=$(get_env_value "FRONTEND_ADMIN_URL" "Frontend Admin URL" "https://banking-ui.vercel.app")
FRONTEND_DASHBOARD_URL=$(get_env_value "FRONTEND_DASHBOARD_URL" "Frontend Dashboard URL" "https://banking-ui.vercel.app")
REACT_APP_CLIENT_URL=$(get_env_value "REACT_APP_CLIENT_URL" "React App Client URL" "https://banking-ui.vercel.app")
PUBLIC_APP_URL=$(get_env_value "PUBLIC_APP_URL" "Public App URL" "https://banking-api-server.vercel.app")

# Add URL configuration
add_env_var "FRONTEND_ADMIN_URL" "$FRONTEND_ADMIN_URL" "plain"
add_env_var "FRONTEND_DASHBOARD_URL" "$FRONTEND_DASHBOARD_URL" "plain"
add_env_var "REACT_APP_CLIENT_URL" "$REACT_APP_CLIENT_URL" "plain"
add_env_var "PUBLIC_APP_URL" "$PUBLIC_APP_URL" "plain"

echo ""
echo "🗄️  Session Store Configuration"

# Session store (Redis/KV) configuration
KV_REST_API_URL=$(get_env_value "KV_REST_API_URL" "KV REST API URL")
KV_REST_API_TOKEN=$(get_env_value "KV_REST_API_TOKEN" "KV REST API Token")

# Add session store configuration
if [ -n "$KV_REST_API_URL" ] && [ -n "$KV_REST_API_TOKEN" ]; then
    add_env_var "KV_REST_API_URL" "$KV_REST_API_URL" "secret"
    add_env_var "KV_REST_API_TOKEN" "$KV_REST_API_TOKEN" "secret"
fi

echo ""
echo "🤖 Agent Configuration"

# Agent configuration
AGENT_OAUTH_CLIENT_ID=$(get_env_value "AGENT_OAUTH_CLIENT_ID" "Agent OAuth Client ID")
AGENT_OAUTH_CLIENT_SECRET=$(get_env_value "AGENT_OAUTH_CLIENT_SECRET" "Agent OAuth Client Secret")
USE_AGENT_ACTOR_FOR_MCP=$(get_env_value "USE_AGENT_ACTOR_FOR_MCP" "Use Agent Actor for MCP" "true")
MCP_RESOURCE_URI=$(get_env_value "MCP_RESOURCE_URI" "MCP Resource URI")

# Add agent configuration
if [ -n "$AGENT_OAUTH_CLIENT_ID" ] && [ -n "$AGENT_OAUTH_CLIENT_SECRET" ]; then
    add_env_var "AGENT_OAUTH_CLIENT_ID" "$AGENT_OAUTH_CLIENT_ID" "secret"
    add_env_var "AGENT_OAUTH_CLIENT_SECRET" "$AGENT_OAUTH_CLIENT_SECRET" "secret"
    add_env_var "USE_AGENT_ACTOR_FOR_MCP" "$USE_AGENT_ACTOR_FOR_MCP" "plain"
fi

if [ -n "$MCP_RESOURCE_URI" ]; then
    add_env_var "MCP_RESOURCE_URI" "$MCP_RESOURCE_URI" "plain"
fi

echo ""
echo "🔍 Optional Configuration"

# Optional configuration
DEBUG_OAUTH=$(get_env_value "DEBUG_OAUTH" "Debug OAuth (true/false)" "false")
DEBUG_TOKENS=$(get_env_value "DEBUG_TOKENS" "Debug Tokens (true/false)" "false")
STEP_UP_AMOUNT_THRESHOLD=$(get_env_value "STEP_UP_AMOUNT_THRESHOLD" "Step-up Amount Threshold" "250")
CIBA_ENABLED=$(get_env_value "CIBA_ENABLED" "CIBA Enabled (true/false)" "false")

# Add optional configuration
add_env_var "DEBUG_OAUTH" "$DEBUG_OAUTH" "plain"
add_env_var "DEBUG_TOKENS" "$DEBUG_TOKENS" "plain"
add_env_var "STEP_UP_AMOUNT_THRESHOLD" "$STEP_UP_AMOUNT_THRESHOLD" "plain"
add_env_var "CIBA_ENABLED" "$CIBA_ENABLED" "plain"

echo ""
echo "📊 AI Configuration"

# AI configuration (optional)
GEMINI_API_KEY=$(get_env_value "GEMINI_API_KEY" "Gemini API Key (optional)")
GOOGLE_AI_API_KEY=$(get_env_value "GOOGLE_AI_API_KEY" "Google AI API Key (optional)")
GEMINI_MODEL=$(get_env_value "GEMINI_MODEL" "Gemini Model" "gemini-1.5-flash")

# Add AI configuration
if [ -n "$GEMINI_API_KEY" ]; then
    add_env_var "GEMINI_API_KEY" "$GEMINI_API_KEY" "secret"
fi

if [ -n "$GOOGLE_AI_API_KEY" ]; then
    add_env_var "GOOGLE_AI_API_KEY" "$GOOGLE_AI_API_KEY" "secret"
fi

add_env_var "GEMINI_MODEL" "$GEMINI_MODEL" "plain"

echo ""
echo "✅ Environment variables restored successfully!"
echo ""
echo "📋 Summary of added variables:"
vercel env ls --environment=$ENVIRONMENT
echo ""
echo "🚀 You can now redeploy your application:"
echo "   vercel --prod"
echo ""
echo "💡 Tip: Save your sensitive values in a secure location for future restores."
