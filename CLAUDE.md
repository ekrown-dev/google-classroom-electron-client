# Claude Development Context

This document provides development context and codebase information for Claude Code when working on the Google Classroom Electron Client project.

## Project Overview

The Google Classroom AI Assistant is an Electron-based desktop application that bridges Claude Desktop with Google Classroom APIs using the Model Context Protocol (MCP). The application enables educators to leverage Claude's AI capabilities for classroom management and educational tasks.

## Architecture

### Technology Stack
- **Frontend**: React 18 + TypeScript + Material-UI (MUI)
- **Backend**: Electron main process + Node.js services
- **Build System**: Vite (renderer) + TypeScript compiler (main/preload)
- **Authentication**: Supabase
- **Payments**: Stripe
- **Security**: Keytar for credential storage

### Core Components

#### Main Process (`src/electron/main.ts`)
- Entry point: `GoogleClassroomMCPApp` class
- Manages app lifecycle, window creation, and IPC handlers
- Integrates all services: Supabase, Stripe, Claude Detection, MCP Launcher, Credentials

#### Services (`src/electron/services/`)
- **SupabaseService**: User authentication and license management
- **StripeService**: Subscription and billing management  
- **ClaudeDetectionService**: Detects and validates Claude Desktop installation
- **CredentialService**: Secure Google credential storage using keytar
- **MCPLauncherService**: Manages MCP server lifecycle and Claude Desktop integration

#### Renderer Process (`src/renderer/`)
- **App.tsx**: Main application component with routing and state management
- **components/**: React components (LoginScreen, Dashboard, SetupWizard, Settings, Navigation)
- **contexts/**: React contexts for shared state (ClaudeStatusContext)
- **types/**: TypeScript definitions for Electron API and global types

## Key Development Commands

### Build Commands
```bash
npm run build                 # Build all components
npm run build:main           # Build main process only
npm run build:preload        # Build preload script only  
npm run build:renderer       # Build React app only
```

### Development Commands
```bash
npm run electron:dev         # Run in development with X11 backend
npm run electron:wayland     # Run with Wayland support
npm run watch:dev           # Watch mode for development
npm run dev:quick           # Quick start without full build
```

### Quality Assurance
```bash
npm run lint                # ESLint for all TypeScript files
npm run lint:fix            # Auto-fix linting issues
npm run type-check          # TypeScript type checking without emit
npm run test                # Run Jest tests
npm run test:coverage       # Run tests with coverage report
```

### Distribution
```bash
npm run electron:build      # Build and package for distribution
npm run electron:dist       # Create distributable packages
npm run electron:publish    # Build and publish updates
```

## Application Flow

### Initialization Sequence
1. **App Launch**: `GoogleClassroomMCPApp` constructor initializes services
2. **Window Creation**: Creates BrowserWindow with preload script
3. **Service Setup**: Registers IPC handlers for all services
4. **Renderer Load**: React app initializes with authentication check

### Authentication Flow
1. **Login Screen**: User enters Supabase credentials
2. **Auth Validation**: Main process validates with Supabase
3. **License Check**: Retrieves user subscription status
4. **Navigation**: Redirects to Setup Wizard or Dashboard based on completion status

### Setup Wizard Flow
1. **Google Credentials**: User configures OAuth or Service Account credentials
2. **Claude Detection**: Validates Claude Desktop installation and subscription
3. **MCP Configuration**: Updates Claude Desktop config with MCP server settings
4. **Completion**: Marks setup as complete and navigates to Dashboard

### MCP Launch Flow
1. **Credential Loading**: Retrieves stored Google credentials
2. **MCP Server Start**: Spawns Node.js MCP server process with environment variables
3. **Claude Config Update**: Modifies Claude Desktop configuration file
4. **Claude Launch**: Starts Claude Desktop with MCP integration enabled

## File Structure

### Configuration Files
- `package.json`: Dependencies, scripts, and Electron Builder configuration
- `tsconfig.json`: Base TypeScript configuration
- `tsconfig.main.json`: Main process TypeScript config
- `tsconfig.preload.json`: Preload script TypeScript config
- `vite.config.ts`: Vite configuration for renderer build

### Build Output (`dist/`)
- `dist/electron/main.js`: Compiled main process
- `dist/electron/preload.cjs`: Compiled preload script (CommonJS)
- `dist/renderer/`: Built React application

### Resources
- `electron/resources/mcp-server/`: Bundled MCP server for production
- `electron/build/`: Electron Builder assets

## IPC Communication

### Authentication Handlers
- `supabase:signIn` / `supabase:signUp` / `supabase:signOut`
- `supabase:getCurrentUser` / `supabase:getLicenseStatus`

### Google Integration Handlers  
- `credentials:save` / `credentials:load` / `credentials:clear`
- `credentials:validate`

### Claude Integration Handlers
- `claude:detect` / `claude:validate` / `claude:getInstallInstructions`

### MCP Management Handlers
- `mcp:launch` / `mcp:stop` / `mcp:getStatus` / `mcp:getLogs`

### System Utilities
- `system:getSystemInfo` / `system:openExternal`
- `app:getVersion` / `app:restart` / `app:checkForUpdates`

## Development Guidelines

### TypeScript Patterns
- Strict type checking enabled across all tsconfig files
- Interface definitions for service responses and IPC communication
- Proper error handling with typed error objects

### Security Considerations
- Credentials stored using system keychain (keytar)
- No sensitive data in logs or error messages
- Secure IPC communication between main and renderer processes
- Environment variables for configuration secrets

### Cross-Platform Support
- Platform-specific paths for Claude Desktop detection
- Different launch mechanisms per platform (open on macOS, direct execution on Windows/Linux)
- Platform-specific configuration directories

### Error Handling
- Service methods return `{ success: boolean, error?: string }` pattern
- Comprehensive logging using electron-log
- User-friendly error messages in UI components

## Testing Strategy

### Unit Tests
- Service layer testing with Jest
- Mock Electron APIs for testing
- Credential validation and MCP configuration tests

### Integration Tests  
- End-to-end authentication flows
- Claude Desktop detection across platforms
- MCP server launch and configuration

### Manual Testing
- Cross-platform compatibility testing
- Claude Desktop integration validation
- Google API integration testing

## Deployment

### Build Process
1. **Clean**: Remove existing dist directory
2. **Compile**: Build main, preload, and renderer components
3. **Bundle**: Package MCP server resources
4. **Package**: Create platform-specific distributables

### Release Process
1. **Version Bump**: Update package.json version
2. **Build**: Run full production build
3. **Test**: Validate on target platforms
4. **Publish**: Upload to distribution servers
5. **Auto-Update**: Electron auto-updater handles user updates

## Troubleshooting

### Common Development Issues

**Preload Script Not Found**
- Ensure preload script builds to `dist/electron/preload.cjs`
- Check file permissions and paths in main.ts:81

**IPC Handler Not Working**
- Verify handler registration in setupIpcHandlers()
- Check renderer-side electronAPI interface definitions

**Service Initialization Failures**
- Review service constructor dependencies
- Check environment variable configuration

**Claude Detection Issues**
- Verify platform-specific paths in ClaudeDetectionService.CLAUDE_PATHS
- Test executable detection logic across platforms

### Debug Tools
- Electron DevTools available in development mode
- electron-log output for main process debugging
- Console logging in renderer process
- IPC message tracing for communication debugging

## Environment Variables

### Required for Development
```bash
# Supabase
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Stripe  
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key
```

### Optional Configuration
```bash
# Development
NODE_ENV=development
APP_ENV=development

# MCP Server
MCP_SERVER_URL=https://mcp.ekrown.com
ELECTRON_APP_HTTP_PORT=3002
```

## Code Patterns

### Service Method Pattern
```typescript
async methodName(params: Type): Promise<{success: boolean, data?: DataType, error?: string}> {
  try {
    // Implementation
    return { success: true, data: result };
  } catch (error: any) {
    log.error('Method failed:', error);
    return { success: false, error: error.message };
  }
}
```

### IPC Handler Pattern
```typescript
ipcMain.handle('namespace:action', async (_, ...args) => {
  return await this.serviceInstance.methodName(...args);
});
```

### React Component State Pattern
```typescript
const [state, setState] = useState<StateType>({
  isLoading: true,
  data: null,
  error: null
});
```

This context should help Claude Code understand the project structure, development patterns, and key implementation details when working on this codebase.