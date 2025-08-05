#!/bin/bash

set -e

echo "🚀 Installing Gmail MCP Server for Claude Code..."

# Build the server
echo "📦 Building server..."
npm run build

# Get the absolute path to the built server
SERVER_PATH="$(pwd)/build/index.js"
echo "📍 Server built at: $SERVER_PATH"

# Create Claude Code config directory if it doesn't exist  
CONFIG_DIR="$HOME/.claude"
CONFIG_FILE="$CONFIG_DIR/mcp_servers.json"

mkdir -p "$CONFIG_DIR"

# Check if config file exists
if [ ! -f "$CONFIG_FILE" ]; then
    echo "📝 Creating new Claude Code MCP config..."
    cat > "$CONFIG_FILE" << EOF
{
  "gmail": {
    "command": "node",
    "args": ["$SERVER_PATH"],
    "env": {}
  }
}
EOF
else
    echo "⚙️  Updating existing Claude Code MCP config..."
    # Use Python to update JSON (more reliable than sed/awk)
    python3 << EOF
import json
import os

config_file = "$CONFIG_FILE"
server_path = "$SERVER_PATH"

try:
    with open(config_file, 'r') as f:
        config = json.load(f)
except:
    config = {}

config['gmail'] = {
    "command": "node",
    "args": [server_path],
    "env": {}
}

with open(config_file, 'w') as f:
    json.dump(config, f, indent=2)

print("✅ Gmail MCP server added to Claude Code config!")
EOF
fi

echo ""
echo "✅ Gmail MCP server installed successfully for Claude Code!"
echo ""
echo "📋 Next steps:"
echo "1. Set up OAuth2 credentials in your shell:"
echo "   export GOOGLE_CLIENT_ID=your-client-id.googleusercontent.com"
echo "   export GOOGLE_CLIENT_SECRET=your-client-secret"
echo ""
echo "2. Test the server in Claude Code:"
echo "   The Gmail tools will be available in your next Claude Code session"
echo ""
echo "3. Start Claude Code - the Gmail tools will be available!"
echo "   On first use, the server will open your browser for Google authentication"
echo ""
echo "📄 Config added to: $CONFIG_FILE"
echo ""
echo "💡 Alternative: Add OAuth2 credentials directly to the config file:"
echo "   Edit $CONFIG_FILE and add your credentials to the 'env' section:"
echo "   \"env\": {"
echo "     \"GOOGLE_CLIENT_ID\": \"your-client-id.googleusercontent.com\","
echo "     \"GOOGLE_CLIENT_SECRET\": \"your-client-secret\""
echo "   }"