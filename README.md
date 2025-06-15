# Google Classroom AI Assistant - Desktop Client

A secure desktop application that bridges Claude Desktop with Google Classroom APIs using the Model Context Protocol (MCP). This application provides enterprise-grade security, licensing controls, and trial period management for educational AI assistants.

**PRODUCTION READY: Complete authentication system with Stripe payment integration and external MCP configuration for Claude Desktop compatibility.**

![eKROWN Technologies](src/renderer/assets/eKRN-logo.png)

## Secure Architecture Overview

```
Claude Desktop → Electron Bridge (localhost:5123) → MCP Server (mcp.ekrown.com/api) → Google Classroom APIs
                      ↓
              License Verification & Trial Management
                      ↓
              Supabase Authentication & Stripe Billing
```

The Electron client acts as a secure bridge between Claude Desktop and the Google Classroom MCP server, ensuring:
- ✅ **License Verification**: Only authenticated users (trial or paid) can access the MCP server
- ✅ **Trial Period Management**: 14-day free trial with 1 CRUD operation per day limit
- ✅ **Token Authentication**: All communications are authenticated with HMAC-SHA256 tokens
- ✅ **Local Security**: Claude Desktop can only connect through localhost bridge
- ✅ **Session Management**: Automatic session timeouts and cleanup
- ✅ **Real-time Subscription Sync**: Automatic license updates after Stripe payments

## 🚀 Features

### 🔐 Authentication & Licensing
- **Supabase Authentication**: Secure user registration, login, and session management
- **14-Day Free Trial**: Full access with usage limitations (1 CRUD operation per day)
- **5-Step Setup Wizard**: Guided trial activation with integrated payment setup
- **Stripe Integration**: Seamless subscription billing and license management ($20/month Pro plan)
- **Trial Payment Setup**: Configure payment method during setup without immediate charging
- **Real-time License Sync**: Automatic subscription status updates after payment
- **Visual Trial Status**: Green indicator when setup complete and trial active

### 🛡️ Security & Bridge Architecture
- **WebSocket Bridge**: Secure localhost:5123 bridge with token authentication
- **HMAC-SHA256 Tokens**: Cryptographic authentication for all MCP communications
- **License Verification**: Real-time verification of trial/subscription status
- **Session Management**: 30-minute sessions with automatic cleanup
- **Rate Limiting**: 100 requests/minute for bridge sessions

### 🎓 Google Classroom Integration
- **Full OAuth2 Support**: Individual user authentication with Google
- **Service Account Support**: Institutional deployment with domain-wide delegation
- **Complete CRUD Operations**: Create, read, update, delete classroom resources
- **Trial Limitations**: 1 creation/modification per day during trial period
- **Unlimited Read Access**: Browse courses, students, assignments without limits

### 🤖 Claude AI Integration
- **Automatic Detection**: Finds and configures Claude Desktop installation
- **MCP Configuration**: Automatically updates Claude config for secure bridge access
- **Bridge-Only Access**: Prevents direct MCP server connections for security
- **Cross-Platform Support**: Windows, macOS, and Linux compatibility

### 💼 Enterprise Features
- **Multi-tenant Architecture**: Support for multiple organizations
- **Webhook Integration**: Stripe webhook handling for license updates
- **Health Monitoring**: Built-in status monitoring and logging
- **Error Handling**: Comprehensive error tracking and user feedback

## 📋 Prerequisites

### Required Software
- **Node.js** 18+ and npm
- **Claude Desktop** installed with paid subscription (Pro or Team)
- **Google Account** with Classroom access
- **Trial or Paid Subscription** (14-day free trial available)

### System Requirements
- **Windows**: Windows 10 or later
- **macOS**: macOS 10.15 (Catalina) or later  
- **Linux**: Ubuntu 18.04+, Fedora 32+, or equivalent

## Installation

### Option 1: Download Release (Recommended)
1. Visit the [Releases page](https://github.com/your-repo/releases)
2. Download the appropriate installer for your platform:
   - Windows: `.exe` installer
   - macOS: `.dmg` file
   - Linux: `.AppImage`, `.deb`, or `.rpm`
3. Run the installer and follow the setup wizard

### Option 2: Build from Source
```bash
# Clone the repository
git clone https://github.com/your-repo/google-classroom-electron-client.git
cd google-classroom-electron-client

# Install dependencies
npm install

# Build the application
npm run build

# Run in development mode
npm run electron:dev

# Or build for production
npm run electron:build
```

## Setup Guide

The application features a comprehensive **5-Step Setup Wizard** that guides you through the complete configuration process:

### 1. Initial Authentication
1. Launch the application
2. **Sign Up**: Create a new account with email verification
   - Automatically receive 14-day free trial
   - 1 CRUD operation per day during trial
3. **Sign In**: Use existing credentials

### 2. **5-Step Setup Wizard**
After authentication, click **"START TRIAL SETUP"** to begin the guided setup process:

#### **Step 1: Welcome**
- Overview of setup requirements
- Introduction to the 5-step process
- Click **"START TRIAL SETUP"** to begin

#### **Step 2: Google Classroom Credentials**
Choose one of the following authentication methods:

**Option A: OAuth 2.0 (Recommended for individual use)**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable Google Classroom API
4. Create OAuth 2.0 credentials:
   - Application type: Desktop application
   - Download the credentials JSON
5. In the app, paste your Client ID and Client Secret

**Option B: Service Account (For organizational use)**
1. In Google Cloud Console, create a Service Account
2. Download the service account JSON key
3. Grant domain-wide delegation if needed
4. In the app, upload your service account JSON file

#### **Step 3: Trial Setup & Payment Method** 🆕
- **14-Day Free Trial Activation**: Set up payment method without immediate charging
- **Payment Method Configuration**: Secured by Stripe payment processing
- **Trial Benefits**:
  - Full access to all features during trial period
  - No charges during the first 14 days
  - Cancel anytime before trial ends
  - Automatic billing starts after trial expires
- **Required Action**: Click **"SET UP PAYMENT METHOD"** to configure billing
- **Note**: Continue button remains disabled until payment method is configured

#### **Step 4: Claude Desktop Integration**
1. Ensure Claude Desktop is installed and you're signed in
2. Verify you have a paid Claude subscription (Pro or Team)
3. The app will automatically detect and configure Claude Desktop
4. **Bridge Configuration**: App automatically configures Claude to use secure bridge
5. Grant necessary permissions when prompted
6. Click **"Configure Claude & Start MCP"** to activate integration

#### **Step 5: Setup Complete**
- **Confirmation**: All components successfully configured
- **Trial Activation**: 14-day free trial now active with payment method on file
- **Visual Indicator**: Trial status shows **green background** indicating successful setup
- **Next Steps**: Access Dashboard to start using the AI assistant

### 3. **Trial-to-Paid Conversion**
- **During Trial**: Use **"UPGRADE PLAN"** button for immediate conversion
- **Auto-Conversion**: Billing automatically starts after 14-day trial period
- **Pricing**: $20/month Pro plan (updated pricing structure)

## Usage

### Dashboard Features
- **License Status**: View trial days remaining or subscription status with **green indicator** when setup complete
- **Usage Monitoring**: Track daily CRUD operations (trial users)
- **Quick Status**: View connection status for Google and Claude
- **Launch Controls**: Start/stop the MCP server and Claude integration
- **Recent Activity**: Monitor recent classroom interactions
- **Subscription Management**: **"UPGRADE PLAN"** button for immediate trial-to-paid conversion
- **System Information**: View app version and system details
- **Trial Management**: Visual indicators for trial status and payment method configuration

### Claude Integration

#### For All Users (Trial & Paid)
**Unlimited Read Operations:**
- Browse classroom lists and details
- View student rosters and information
- Check assignment submissions and grades
- Access course materials and announcements
- Review classroom activity and analytics

#### Trial Users (1 Operation/Day)
**Limited Write Operations:**
- Create 1 assignment per day
- OR update 1 existing assignment per day
- OR create 1 announcement per day
- OR make 1 gradebook entry per day

#### Paid Users (Unlimited)
**Full CRUD Access:**
- Create unlimited assignments, announcements, and materials
- Bulk update student grades and feedback
- Manage multiple courses simultaneously
- Advanced automation and workflow features

### Example Claude Prompts

#### Read Operations (Unlimited for all users)
```
"Show me all my active classes"
"List students in my Math 101 course"
"What assignments are due this week?"
"Show me recent submissions for my English assignment"
"Generate a progress report for my students"
```

#### Write Operations (Limited for trial users)
```
"Create an assignment for my English class due next Friday" [Trial: 1/day]
"Update the due date for my Math homework" [Trial: 1/day]
"Post an announcement about tomorrow's quiz" [Trial: 1/day]
"Grade this student's essay with feedback" [Trial: 1/day]
```

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in the project root:

```bash
# Supabase Authentication
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Stripe Payments (Updated Pricing Structure)
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key
# Current Price IDs:
# Free Trial: price_1RZ7YYDFOqrH8dpSjXL6A25g (0.00)
# Pro Plan: price_1RZ7XYDFOqrH8dpSyfxS0nWJ (20.00)

# MCP Bridge Configuration
MCP_BRIDGE_PORT=5123
ELECTRON_BRIDGE_SECRET=your-shared-secret-key
MCP_SERVER_URL=https://mcp.ekrown.com

# Development Settings
NODE_ENV=development
APP_ENV=development
ELECTRON_APP_HTTP_PORT=3002
```

### Google Credentials Setup

The application supports two credential types:

1. **OAuth2 Credentials** (Recommended for individual users)
2. **Service Account JSON** (Recommended for institutional use)

Configure through the Setup Wizard after first launch.

### Claude Desktop Config
The app automatically manages Claude Desktop configuration at:
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS**: `~/.config/claude-desktop/claude_desktop_config.json`
- **Linux**: `~/.config/claude-desktop/claude_desktop_config.json`

## 🔒 Security Features

### Bridge Service Architecture

The application implements a secure WebSocket bridge that:

- **Localhost Only**: Accepts connections only from localhost:5123
- **Token Authentication**: Validates HMAC-SHA256 tokens before allowing access
- **License Verification**: Checks active subscription status via Supabase
- **Session Management**: 30-minute session timeouts with automatic cleanup
- **Rate Limiting**: 100 requests per minute per authenticated session

### Claude Desktop Integration

- **Configuration Lock**: Automatically configures Claude Desktop to use only the local bridge
- **Direct Access Prevention**: Removes any direct MCP server connections
- **Authentication Required**: All MCP requests must pass through authenticated bridge

### Communication Security

- **HTTPS Only**: All external communications use HTTPS
- **Token Rotation**: Secure token generation using shared secrets
- **Request Validation**: All bridge requests validated with security headers
- **Origin Filtering**: Only authorized origins accepted

## 🛠️ Development

### Project Structure
```
src/
├── electron/           # Main process code
│   ├── main.ts        # Application entry point
│   ├── preload.ts     # Preload script for renderer
│   └── services/      # Backend services
├── renderer/          # React UI code
│   ├── components/    # React components
│   ├── contexts/      # React contexts
│   └── types/         # TypeScript definitions
└── ...
```

### Available Scripts
```bash
# Development
npm run electron:dev          # Run in development mode
npm run watch:dev            # Watch mode with hot reload
npm run dev:quick            # Quick development start

# Building
npm run build               # Build all components
npm run build:main          # Build main process
npm run build:preload       # Build preload script  
npm run build:renderer      # Build React app

# Testing & Quality
npm run test               # Run tests
npm run lint               # Run ESLint
npm run type-check         # TypeScript type checking

# Distribution
npm run electron:build     # Build for distribution
npm run electron:dist      # Create distributable packages
```

### Development Environment
1. Install dependencies: `npm install`
2. Set up environment variables (`.env`)
3. Run in development mode: `npm run electron:dev`
4. The app will open with developer tools enabled

## Troubleshooting

### Common Issues

**Claude Desktop Not Detected**
- Ensure Claude Desktop is installed from the official website
- Verify you have a paid subscription (Pro or Team)
- Check installation path matches expected locations

**Google API Errors**
- Verify Google Classroom API is enabled in your Google Cloud project
- Check OAuth consent screen configuration
- Ensure credentials have proper scopes

**MCP Server Connection Issues**
- Check firewall settings
- Verify Claude Desktop configuration file
- Review application logs for detailed error messages

**Permission Errors**
- Ensure the app has permission to write to Claude config directory
- On macOS/Linux, check file permissions
- Run as administrator if necessary (Windows)

### Logs and Debugging
- Application logs: Check the developer console in development mode
- MCP Server logs: Available in the Dashboard's system information
- Claude Desktop logs: Check Claude's own log files

### Support
- Create an issue on [GitHub Issues](https://github.com/your-repo/issues)
- Contact support: support@ekrown.com
- Documentation: https://docs.ekrown.com/google-classroom-mcp

## Security

### Data Protection
- All credentials are encrypted and stored in the system keychain
- OAuth tokens are securely managed and automatically refreshed
- No sensitive data is logged or transmitted insecurely
- MCP communication uses secure local protocols

### Privacy
- The application only accesses Google Classroom data you explicitly authorize
- No data is shared with third parties beyond necessary service providers
- User data is handled in compliance with educational privacy standards

## License

MIT License - see [LICENSE](LICENSE) file for details

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Acknowledgments

- Built with [Electron](https://electronjs.org/)
- UI powered by [Material-UI](https://mui.com/)
- Authentication by [Supabase](https://supabase.com/)
- AI integration with [Claude Desktop](https://claude.ai/)
- Model Context Protocol by [Anthropic](https://www.anthropic.com/)

---

**eKROWN Technologies** - Empowering Education with AI