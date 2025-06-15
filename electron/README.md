# Google Classroom MCP Desktop App

This directory contains the Electron application files for the Google Classroom MCP Desktop App.

## Directory Structure

- `build/` - Build resources for electron-builder
  - `icons/` - Application icons for various platforms
  - `entitlements.mac.plist` - macOS entitlements for notarization
- `resources/` - Resources bundled with the application
  - `mcp-server/` - The MCP server code bundle

## Development

Run the application in development mode:

```bash
npm run electron:dev
```

Build the application for production:

```bash
npm run electron:build
```

Create distribution packages:

```bash
npm run electron:dist
```

## Configuration

See `.env` file in the root directory for environment variables.

## Note

The MCP server code is bundled with the desktop application during the build process.