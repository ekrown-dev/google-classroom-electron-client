#!/bin/bash

# Bundle MCP server for the Electron app

echo "Bundling MCP server for Electron app..."

# Create the destination directory
mkdir -p electron/resources/mcp-server

# Copy the compiled MCP server
cp -r dist/* electron/resources/mcp-server/

# Copy necessary files (excluding node_modules, which will be bundled by electron-builder)
cp package.json electron/resources/mcp-server/

echo "MCP server bundled successfully!"