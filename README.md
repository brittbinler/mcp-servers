# MCP Servers Collection

A curated collection of Model Context Protocol (MCP) servers for enhancing AI assistants with powerful integrations and capabilities.

## What is MCP?

The Model Context Protocol (MCP) is an open standard that enables AI assistants to securely access external tools and data sources. MCP servers provide specific capabilities that can be used by compatible AI clients like Claude.

## Available Servers

### 📧 Gmail MCP Server
**Location**: `./gmail/`

A comprehensive Gmail integration server providing 20 powerful email management tools.

**Features:**
- ✉️ Send and draft emails with HTML support
- 🔍 Advanced email search and content extraction  
- 📁 Complete label management
- 🗂️ Draft lifecycle management
- 🔗 Email thread handling
- 📎 Attachment support
- 🗑️ Trash management with restore

**Quick Start:**
```bash
cd gmail
npm install
npm run build
```

[📖 Full Documentation](./gmail/README.md)

## Getting Started

### Prerequisites
- Node.js 16 or higher
- Compatible MCP client (Claude Code, Claude Desktop, etc.)

### Installation

1. **Clone this repository:**
```bash
git clone https://github.com/brittbinler/mcp-servers.git
cd mcp-servers
```

2. **Choose a server and install dependencies:**
```bash
cd gmail  # or any other server
npm install
npm run build
```

3. **Configure your MCP client** with the server path and any required environment variables.

## MCP Client Configuration

### Claude Code
Add servers to `~/.claude/mcp_servers.json`:
```json
{
  "gmail": {
    "command": "node",
    "args": ["/path/to/mcp_servers/gmail/build/index.js"],
    "env": {
      "GOOGLE_CLIENT_ID": "your-credentials-here"
    }
  }
}
```

### Claude Desktop
Add servers to `~/Library/Application Support/Claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "gmail": {
      "command": "node", 
      "args": ["/path/to/mcp_servers/gmail/build/index.js"],
      "env": {
        "GOOGLE_CLIENT_ID": "your-credentials-here"
      }  
    }
  }
}
```

## Development

### Project Structure
```
mcp_servers/
├── gmail/                 # Gmail integration server
│   ├── src/              # TypeScript source code
│   ├── build/            # Compiled JavaScript
│   ├── package.json      # Dependencies and scripts
│   └── README.md         # Server-specific documentation
├── .gitignore            # Git ignore rules
└── README.md             # This file
```

### Adding New Servers

1. **Create a new directory** for your server
2. **Initialize with standard structure:**
   - `src/` - TypeScript source code
   - `package.json` - Dependencies and build scripts  
   - `README.md` - Documentation
   - `tsconfig.json` - TypeScript configuration

3. **Implement MCP server interface** using the official SDK
4. **Add comprehensive documentation** and examples
5. **Update this README** with your server information

### Common Scripts
Most servers support these npm scripts:
```bash
npm install     # Install dependencies
npm run build   # Build the server
npm run dev     # Development mode with hot reload
npm test        # Run tests
npm start       # Start the server
```

## Security & Privacy

- 🔐 All servers run locally and use official authentication methods
- 🏠 No data is sent to third parties unless explicitly configured
- 🛡️ Each server follows security best practices for their respective APIs
- 💾 Credentials and tokens are stored locally and encrypted where possible

## Contributing

We welcome contributions! Here's how to get started:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/new-server`
3. **Make your changes** following our coding standards
4. **Add tests** if applicable
5. **Update documentation**
6. **Submit a pull request**

### Contribution Guidelines

- Follow existing code style and structure
- Include comprehensive documentation
- Add example usage in README files
- Ensure security best practices
- Test thoroughly before submitting

## Troubleshooting

### Common Issues

**Server not showing up in MCP client:**
- Verify the server path in your configuration
- Check that the server built successfully (`npm run build`)
- Ensure Node.js version compatibility

**Authentication errors:**
- Verify environment variables are set correctly
- Check API credentials and permissions
- Review server-specific authentication requirements

**Permission denied:**
- Ensure file permissions allow execution
- Check that Node.js can access the server files

### Getting Help

- 📖 Check individual server README files for specific guidance
- 🐛 [Report bugs or request features](https://github.com/brittbinler/mcp-servers/issues)
- 💬 [Join community discussions](https://github.com/brittbinler/mcp-servers/discussions)

## License

This project is licensed under the MIT License - see individual server directories for specific license information.

## Related Resources

- 📚 [MCP Specification](https://spec.modelcontextprotocol.io/)
- 🔧 [MCP SDK Documentation](https://github.com/modelcontextprotocol/typescript-sdk)
- 🎯 [Claude Code Documentation](https://docs.anthropic.com/claude-code)
- 🖥️ [Claude Desktop](https://claude.ai/download)

---

⭐ **Star this repository** if you find these MCP servers useful!