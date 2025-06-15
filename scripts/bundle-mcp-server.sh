#!/bin/bash

# Bundle MCP server for the Electron app from external directory

echo "Bundling MCP server for Electron app..."

# Set the path to the external MCP server
MCP_SERVER_PATH="../google-classroom-mcp-server"

# Check if MCP server exists and is built
if [ ! -d "$MCP_SERVER_PATH/dist" ]; then
    echo "Error: MCP server not found or not built at $MCP_SERVER_PATH"
    echo "Please build the MCP server first: cd $MCP_SERVER_PATH && npm run build"
    exit 1
fi

# Create the destination directory
mkdir -p electron/resources/mcp-server

# Copy the compiled MCP server from external directory
cp -r "$MCP_SERVER_PATH/dist"/* electron/resources/mcp-server/

# Copy necessary files (excluding node_modules, which will be bundled by electron-builder)
cp "$MCP_SERVER_PATH/package.json" electron/resources/mcp-server/

echo "MCP server bundled successfully from $MCP_SERVER_PATH!"