#!/usr/bin/env bash
# start.sh — Start all banking digital assistant services
set -e

BASEDIR="$(cd "$(dirname "$0")" && pwd)"

echo "🏦 Starting Banking Digital Assistant..."
echo "   Using PingOne environment: ${PINGONE_ENVIRONMENT_ID:-see .env files}"

# Check for node_modules
for svc in demo_api_server demo_mcp_server langchain_agent demo_api_ui; do
  if [ ! -d "$BASEDIR/$svc/node_modules" ]; then
    echo "📦 Installing dependencies for $svc..."
    (cd "$BASEDIR/$svc" && npm install)
  fi
done

# Start demo_api_server (port 3001)
echo "🚀 Starting Banking API Server on :3001..."
(cd "$BASEDIR/demo_api_server" && npm start > /tmp/banking-api-server.log 2>&1) &
echo $! > /tmp/banking-api-server.pid

sleep 1

# Start demo_mcp_server (port 8080)
if [ -d "$BASEDIR/demo_mcp_server" ]; then
  echo "🤖 Starting Banking MCP Server on :8080..."
  (cd "$BASEDIR/demo_mcp_server" && cp .env.development .env 2>/dev/null; npm start > /tmp/banking-mcp-server.log 2>&1) &
  echo $! > /tmp/banking-mcp-server.pid
fi

# Start langchain_agent backend (port 8888)
if [ -f "$BASEDIR/langchain_agent/server.py" ] || [ -f "$BASEDIR/langchain_agent/main.py" ]; then
  echo "🔗 Starting LangChain Agent Backend on :8888..."
  (cd "$BASEDIR/langchain_agent" && python3 -m uvicorn main:app --port 8888 > /tmp/langchain-agent.log 2>&1) &
  echo $! > /tmp/langchain-agent.pid
fi

# Start demo_api_ui (port 3000)
if [ -d "$BASEDIR/demo_api_ui" ]; then
  echo "🌐 Starting Banking UI on :3000..."
  (cd "$BASEDIR/demo_api_ui" && npm start > /tmp/banking-ui.log 2>&1) &
  echo $! > /tmp/banking-ui.pid
fi

echo ""
echo "✅ Services started:"
echo "   Banking API Server: https://api.ping.demo:3001"
echo "   Banking MCP Server: ws://localhost:8080 (internal)"
echo "   Banking UI:         https://api.ping.demo:4000"
echo "   LangChain Agent:    http://localhost:8888 (internal)"
echo ""
echo "📋 Logs:"
echo "   Banking API: /tmp/banking-api-server.log"
echo "   MCP Server:  /tmp/banking-mcp-server.log"
echo "   Agent:       /tmp/langchain-agent.log"
echo "   UI:          /tmp/banking-ui.log"
echo ""
echo "ℹ️  To stop all services: ./stop.sh"
