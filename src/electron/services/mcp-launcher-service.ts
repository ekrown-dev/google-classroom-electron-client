import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import log from 'electron-log';
import { CredentialService } from './credential-service.js';
import { ClaudeDetectionService } from './claude-detection-service.js';
import { MCPBridgeService } from './mcp-bridge-service.js';

interface MCPServerConfig {
  command: string;
  args: string[];
  env: Record<string, string>;
}

interface MCPLaunchResult {
  success: boolean;
  processId?: number;
  error?: string;
}

interface MCPStatus {
  isRunning: boolean;
  processId?: number;
  uptime?: number;
  lastLaunchedAt?: Date;
  error?: string;
}

interface MCPLog {
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  source: 'mcp-server' | 'claude-desktop' | 'launcher';
}

export class MCPLauncherService {
  private mcpServerProcess: ChildProcess | null = null;
  private claudeDesktopProcess: ChildProcess | null = null;
  private credentialService: CredentialService;
  private claudeDetectionService: ClaudeDetectionService;
  private mcpBridgeService: MCPBridgeService | null = null;
  private logs: MCPLog[] = [];
  private maxLogs = 1000;
  private launchedAt: Date | null = null;

  constructor(bridgeService?: MCPBridgeService) {
    this.credentialService = new CredentialService();
    this.claudeDetectionService = new ClaudeDetectionService();
    this.mcpBridgeService = bridgeService || null;
  }

  async launchClaudeWithMCP(): Promise<MCPLaunchResult> {
    try {
      this.addLog('info', 'Starting Claude Desktop with MCP server...', 'launcher');

      // Check if Claude Desktop is installed
      const claudeDetection = await this.claudeDetectionService.detectClaudeDesktop();
      if (!claudeDetection.isInstalled) {
        const error = 'Claude Desktop is not installed. Please install Claude Desktop first.';
        this.addLog('error', error, 'launcher');
        return {
          success: false,
          error
        };
      }

      // Load credentials
      const credentialResult = await this.credentialService.loadCredentials();
      if (!credentialResult.success || !credentialResult.credentials) {
        const error = 'No Google credentials found. Please configure credentials first.';
        this.addLog('error', error, 'launcher');
        return {
          success: false,
          error
        };
      }

      // Start the bridge service if available
      if (this.mcpBridgeService) {
        this.addLog('info', 'Starting MCP bridge service...', 'launcher');
        const bridgeResult = await this.mcpBridgeService.startBridge();
        if (!bridgeResult.success) {
          this.addLog('error', `Failed to start bridge service: ${bridgeResult.error}`, 'launcher');
          return {
            success: false,
            error: `Bridge service failed: ${bridgeResult.error}`
          };
        }
        
        // Configure Claude-desktop to use bridge
        await this.updateClaudeDesktopConfigForBridge();
        this.addLog('info', 'Bridge service started, Claude configured for bridge connection', 'launcher');
      } else {
        // Fallback to direct MCP server configuration (legacy mode)
        const mcpConfig = await this.createMCPConfiguration(credentialResult.credentials);
        await this.updateClaudeDesktopConfig();
        
        // Start MCP server
        const mcpServerResult = await this.startMCPServer(mcpConfig);
        if (!mcpServerResult.success) {
          this.addLog('error', `Failed to start MCP server: ${mcpServerResult.error}`, 'launcher');
          return mcpServerResult;
        }
        await this.sleep(2000);
      }

      // Launch Claude Desktop
      const claudeResult = await this.launchClaudeDesktop(claudeDetection.installPath!);
      if (!claudeResult.success) {
        this.addLog('error', `Failed to launch Claude Desktop: ${claudeResult.error}`, 'launcher');
        await this.stopMCPServer(); // Clean up MCP server if Claude fails
        return claudeResult;
      }

      this.launchedAt = new Date();
      this.addLog('info', 'Claude Desktop launched successfully with MCP server', 'launcher');

      return {
        success: true,
        processId: this.claudeDesktopProcess?.pid
      };
    } catch (error: any) {
      this.addLog('error', `Launch failed: ${error.message}`, 'launcher');
      return {
        success: false,
        error: error.message
      };
    }
  }

  async stopMCP(): Promise<{ success: boolean; error?: string }> {
    try {
      this.addLog('info', 'Stopping MCP server and Claude Desktop...', 'launcher');

      let mcpStopped = true;
      let claudeStopped = true;

      // Stop bridge service if running
      if (this.mcpBridgeService) {
        const bridgeResult = await this.mcpBridgeService.stopBridge();
        if (!bridgeResult.success) {
          this.addLog('warn', `Bridge service stop failed: ${bridgeResult.error}`, 'launcher');
        }
      }

      // Stop MCP server
      if (this.mcpServerProcess && !this.mcpServerProcess.killed) {
        mcpStopped = await this.stopMCPServer();
      }

      // Stop Claude Desktop (optional - user might want to keep it running)
      if (this.claudeDesktopProcess && !this.claudeDesktopProcess.killed) {
        claudeStopped = await this.stopClaudeDesktop();
      }

      this.launchedAt = null;

      if (mcpStopped && claudeStopped) {
        this.addLog('info', 'MCP server and Claude Desktop stopped successfully', 'launcher');
        return { success: true };
      } else {
        const error = 'Some processes could not be stopped cleanly';
        this.addLog('warn', error, 'launcher');
        return { success: false, error };
      }
    } catch (error: any) {
      this.addLog('error', `Stop failed: ${error.message}`, 'launcher');
      return {
        success: false,
        error: error.message
      };
    }
  }

  getStatus(): MCPStatus {
    const isRunning = this.mcpServerProcess !== null && 
                     !this.mcpServerProcess.killed && 
                     this.claudeDesktopProcess !== null && 
                     !this.claudeDesktopProcess.killed;

    let uptime: number | undefined;
    if (isRunning && this.launchedAt) {
      uptime = Math.floor((Date.now() - this.launchedAt.getTime()) / 1000);
    }

    return {
      isRunning,
      processId: this.claudeDesktopProcess?.pid,
      uptime,
      lastLaunchedAt: this.launchedAt || undefined
    };
  }

  getLogs(): MCPLog[] {
    return [...this.logs];
  }

  clearLogs(): void {
    this.logs = [];
    this.addLog('info', 'Logs cleared', 'launcher');
  }

  private async createMCPConfiguration(credentials: any): Promise<MCPServerConfig> {
    const mcpServerPath = await this.getMCPServerPath();
    
    const env: Record<string, string> = {
      NODE_ENV: process.env.APP_ENV || 'production',
      MCP_SERVER_URL: process.env.MCP_SERVER_URL || 'https://mcp.ekrown.com'
    };

    // Add Google credentials to environment
    if (credentials.credentialType === 'oauth') {
      env.GOOGLE_CLIENT_ID = credentials.clientId;
      env.GOOGLE_CLIENT_SECRET = credentials.clientSecret;
      env.GOOGLE_REDIRECT_URI = 'http://localhost:8080';
    } else if (credentials.credentialType === 'serviceAccount') {
      // For service account, we'll create a temporary file
      const tempFile = await this.createTempServiceAccountFile(credentials.serviceAccountJson);
      env.GOOGLE_SERVICE_ACCOUNT_PATH = tempFile;
    }

    return {
      command: 'node',
      args: [mcpServerPath],
      env
    };
  }

  private async getMCPServerPath(): Promise<string> {
    // In development, use the external MCP server
    if (process.env.NODE_ENV === 'development') {
      return path.join(process.cwd(), '..', 'google-classroom-mcp-server', 'dist', 'index.js');
    }
    
    // In production, the server should be bundled with the app
    const resourcesPath = (process as any).resourcesPath || path.join(process.cwd(), 'resources');
    return path.join(resourcesPath, 'mcp-server', 'index.js');
  }

  private getBridgeConnectorPath(): string {
    // Store the bridge connector script in the user's config directory
    const platform = process.platform;
    const configPaths = {
      win32: path.join(os.homedir(), 'AppData', 'Roaming', 'Claude'),
      darwin: path.join(os.homedir(), 'Library', 'Application Support', 'Claude'),
      linux: path.join(os.homedir(), '.config', 'Claude')
    };

    const configDir = configPaths[platform as keyof typeof configPaths] || configPaths.linux;
    return path.join(configDir, 'mcp-bridge-connector.js');
  }

  private async writeBridgeConnectorScript(scriptPath: string): Promise<void> {
    try {
      // Ensure directory exists
      await fs.mkdir(path.dirname(scriptPath), { recursive: true });
      
      // Write the bridge connector script to the file
      const scriptContent = this.getBridgeConnectorScript();
      await fs.writeFile(scriptPath, scriptContent, 'utf8');
      
      this.addLog('info', `Bridge connector script written to ${scriptPath}`, 'launcher');
    } catch (error: any) {
      this.addLog('error', `Failed to write bridge connector script: ${error.message}`, 'launcher');
      throw error;
    }
  }

  private async createTempServiceAccountFile(serviceAccountJson: string): Promise<string> {
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `service-account-${Date.now()}.json`);
    
    await fs.writeFile(tempFile, serviceAccountJson, 'utf8');
    
    // Clean up the temp file after 5 minutes
    setTimeout(async () => {
      try {
        await fs.unlink(tempFile);
        this.addLog('debug', `Cleaned up temporary service account file: ${tempFile}`, 'launcher');
      } catch (error) {
        this.addLog('warn', `Failed to clean up temp file: ${tempFile}`, 'launcher');
      }
    }, 5 * 60 * 1000);
    
    return tempFile;
  }

  private async updateClaudeDesktopConfig(): Promise<void> {
    try {
      const configPath = await this.claudeDetectionService.getClaudeConfigPath();
      
      if (!configPath) {
        // Create config directory and file
        const platform = process.platform;
        
        const configPaths = {
          win32: path.join(os.homedir(), 'AppData', 'Roaming', 'Claude'),
          darwin: path.join(os.homedir(), 'Library', 'Application Support', 'Claude'),
          linux: path.join(os.homedir(), '.config', 'Claude')
        };

        const configDir = configPaths[platform as keyof typeof configPaths] || configPaths.linux;
        await fs.mkdir(configDir, { recursive: true });
        
        const newConfigPath = path.join(configDir, 'claude_desktop_config.json');
        await this.writeClaudeConfig(newConfigPath);
      } else {
        // Update existing config
        await this.updateExistingClaudeConfig(configPath);
      }

      this.addLog('info', 'Claude Desktop configuration updated', 'launcher');
    } catch (error: any) {
      this.addLog('error', `Failed to update Claude config: ${error.message}`, 'launcher');
      throw error;
    }
  }

  private async writeClaudeConfig(configPath: string): Promise<void> {
    // Create and write the bridge connector script to a file
    const bridgeConnectorPath = this.getBridgeConnectorPath();
    await this.writeBridgeConnectorScript(bridgeConnectorPath);

    // Configure Claude-desktop to use the external bridge script
    const config = {
      mcpServers: {
        'google-classroom-mcp-bridge': {
          command: 'node',
          args: [bridgeConnectorPath],
          env: {
            BRIDGE_URL: 'ws://localhost:5123',
            BRIDGE_TOKEN: process.env.MCP_BRIDGE_TOKEN || 'secure-bridge-token'
          }
        }
      }
    };

    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
  }

  private async updateExistingClaudeConfig(configPath: string): Promise<void> {
    let config: any = {};
    
    try {
      const existingContent = await fs.readFile(configPath, 'utf8');
      config = JSON.parse(existingContent);
    } catch (error) {
      this.addLog('warn', 'Could not read existing Claude config, creating new one', 'launcher');
    }

    if (!config.mcpServers) {
      config.mcpServers = {};
    }

    // Remove any direct MCP server connections and replace with bridge
    delete config.mcpServers['google-classroom-mcp'];
    
    // Create and write the bridge connector script to a file
    const bridgeConnectorPath = this.getBridgeConnectorPath();
    await this.writeBridgeConnectorScript(bridgeConnectorPath);
    
    config.mcpServers['google-classroom-mcp-bridge'] = {
      command: 'node',
      args: [bridgeConnectorPath],
      env: {
        BRIDGE_URL: 'ws://localhost:5123',
        BRIDGE_TOKEN: process.env.MCP_BRIDGE_TOKEN || 'secure-bridge-token'
      }
    };

    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
  }

  private async updateClaudeDesktopConfigForBridge(): Promise<void> {
    try {
      const configPath = await this.claudeDetectionService.getClaudeConfigPath();
      
      if (!configPath) {
        // Create config directory and file
        const platform = process.platform;
        const configPaths = {
          win32: path.join(os.homedir(), 'AppData', 'Roaming', 'Claude'),
          darwin: path.join(os.homedir(), 'Library', 'Application Support', 'Claude'),
          linux: path.join(os.homedir(), '.config', 'Claude')
        };

        const configDir = configPaths[platform as keyof typeof configPaths] || configPaths.linux;
        await fs.mkdir(configDir, { recursive: true });
        
        const newConfigPath = path.join(configDir, 'claude_desktop_config.json');
        await this.writeBridgeConfig(newConfigPath);
      } else {
        // Update existing config
        await this.updateExistingConfigForBridge(configPath);
      }

      this.addLog('info', 'Claude Desktop configured for bridge connection', 'launcher');
    } catch (error: any) {
      this.addLog('error', `Failed to configure Claude for bridge: ${error.message}`, 'launcher');
      throw error;
    }
  }

  private async writeBridgeConfig(configPath: string): Promise<void> {
    const bridgeConfig = this.mcpBridgeService?.getBridgeConfig();
    this.addLog('info', `Creating/updating Claude config with bridge at ${configPath}`, 'launcher');
    
    // CRITICAL FIX: Read existing config first to preserve existing mcpServers
    let existingConfig: any = {};
    
    try {
      if (await this.pathExists(configPath)) {
        this.addLog('info', `Reading existing Claude config from ${configPath}`, 'launcher');
        
        // Create backup before any modification
        const backupPath = configPath + '.backup.' + Date.now();
        await fs.copyFile(configPath, backupPath);
        this.addLog('info', `Created backup at ${backupPath}`, 'launcher');
        
        const existingContent = await fs.readFile(configPath, 'utf8');
        if (existingContent.trim()) {
          existingConfig = JSON.parse(existingContent);
          this.addLog('info', `Successfully parsed existing config with ${Object.keys(existingConfig.mcpServers || {}).length} existing MCP servers`, 'launcher');
        }
      }
    } catch (error: any) {
      this.addLog('warn', `Could not read existing config: ${error.message}. Creating new config.`, 'launcher');
    }

    // SAFE MERGE: Preserve ALL existing mcpServers exactly as they were
    if (!existingConfig.mcpServers) {
      existingConfig.mcpServers = {};
    }

    // ONLY add googleClassroom if it doesn't exist, never modify existing servers
    if (!existingConfig.mcpServers.googleClassroom) {
      // Create and write the bridge connector script to a file
      const bridgeConnectorPath = this.getBridgeConnectorPath();
      await this.writeBridgeConnectorScript(bridgeConnectorPath);
      
      existingConfig.mcpServers.googleClassroom = {
        command: "node",
        args: [bridgeConnectorPath],
        env: {
          MCP_BRIDGE_URL: `ws://localhost:${bridgeConfig?.port || 5123}`,
          MCP_BRIDGE_TOKEN: bridgeConfig?.authToken || 'default-token'
        }
      };
      this.addLog('info', `Added googleClassroom MCP server configuration with external script at ${bridgeConnectorPath}`, 'launcher');
    } else {
      this.addLog('info', `googleClassroom MCP server already exists, skipping`, 'launcher');
    }

    this.addLog('info', `Config now contains ${Object.keys(existingConfig.mcpServers).length} MCP servers: ${Object.keys(existingConfig.mcpServers).join(', ')}`, 'launcher');

    await fs.writeFile(configPath, JSON.stringify(existingConfig, null, 2), 'utf8');
    this.addLog('info', `Successfully updated Claude config for bridge at ${configPath}`, 'launcher');
  }

  private async pathExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async updateExistingConfigForBridge(configPath: string): Promise<void> {
    let config: any = {};
    
    try {
      // Create backup before any modification
      const backupPath = configPath + '.backup.' + Date.now();
      await fs.copyFile(configPath, backupPath);
      this.addLog('info', `Created backup at ${backupPath}`, 'launcher');
      
      const existingContent = await fs.readFile(configPath, 'utf8');
      if (existingContent.trim()) {
        config = JSON.parse(existingContent);
        this.addLog('info', `Successfully read existing Claude config from ${configPath}`, 'launcher');
      }
    } catch (error) {
      this.addLog('warn', 'Could not read existing Claude config, creating new one', 'launcher');
    }

    if (!config.mcpServers) {
      config.mcpServers = {};
    }

    // SAFE CLEANUP: Only remove our previous installations, preserve user's other MCP servers
    const ourServerNames = ['google-classroom-mcp', 'google-classroom-bridge'];
    const existingServers = Object.keys(config.mcpServers);
    this.addLog('info', `Found ${existingServers.length} existing MCP servers: ${existingServers.join(', ')}`, 'launcher');
    
    // Remove only our previous versions, keep everything else
    ourServerNames.forEach(serverName => {
      if (config.mcpServers[serverName]) {
        delete config.mcpServers[serverName];
        this.addLog('info', `Removed previous ${serverName} configuration`, 'launcher');
      }
    });
    
    const bridgeConfig = this.mcpBridgeService?.getBridgeConfig();
    this.addLog('info', `Bridge config: port=${bridgeConfig?.port}, hasToken=${!!bridgeConfig?.authToken}`, 'launcher');
    
    // ONLY add googleClassroom if it doesn't exist
    if (!config.mcpServers.googleClassroom) {
      // Create and write the bridge connector script to a file
      const bridgeConnectorPath = this.getBridgeConnectorPath();
      await this.writeBridgeConnectorScript(bridgeConnectorPath);
      
      config.mcpServers.googleClassroom = {
        command: "node",
        args: [bridgeConnectorPath],
        env: {
          MCP_BRIDGE_URL: `ws://localhost:${bridgeConfig?.port || 5123}`,
          MCP_BRIDGE_TOKEN: bridgeConfig?.authToken || 'default-token'
        }
      };
      this.addLog('info', `Added googleClassroom MCP server configuration with external script at ${bridgeConnectorPath}`, 'launcher');
    } else {
      this.addLog('info', `googleClassroom MCP server already exists, preserving existing configuration`, 'launcher');
    }

    const finalServers = Object.keys(config.mcpServers);
    this.addLog('info', `Final config contains ${finalServers.length} MCP servers: ${finalServers.join(', ')}`, 'launcher');

    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
    this.addLog('info', `Successfully updated Claude config for bridge at ${configPath}`, 'launcher');
  }

  private getBridgeConnectorScript(): string {
    return `
const WebSocket = require('ws');

class BridgeConnector {
  constructor() {
    this.bridgeUrl = process.env.BRIDGE_URL || 'ws://localhost:5123';
    this.bridgeToken = process.env.BRIDGE_TOKEN || 'secure-bridge-token';
    this.ws = null;
    this.authenticated = false;
  }

  async connect() {
    try {
      this.ws = new WebSocket(this.bridgeUrl);
      
      this.ws.on('open', () => {
        // Authenticate with bridge
        this.ws.send(JSON.stringify({
          type: 'auth',
          token: this.bridgeToken
        }));
      });

      this.ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'auth_success') {
          this.authenticated = true;
          console.error('Bridge authentication successful');
        } else {
          // Forward message to Claude-desktop via stdout
          console.log(JSON.stringify(message));
        }
      });

      this.ws.on('error', (error) => {
        console.error('Bridge connection error:', error.message);
        process.exit(1);
      });

      this.ws.on('close', () => {
        console.error('Bridge connection closed');
        process.exit(0);
      });

      // Handle stdin from Claude-desktop
      process.stdin.on('data', (data) => {
        if (this.authenticated && this.ws && this.ws.readyState === WebSocket.OPEN) {
          try {
            const message = JSON.parse(data.toString());
            this.ws.send(JSON.stringify(message));
          } catch (error) {
            console.error('Error parsing stdin:', error.message);
          }
        }
      });

    } catch (error) {
      console.error('Failed to connect to bridge:', error.message);
      process.exit(1);
    }
  }
}

const connector = new BridgeConnector();
connector.connect();
`;
  }

  private async startMCPServer(mcpConfig: MCPServerConfig): Promise<MCPLaunchResult> {
    return new Promise((resolve) => {
      try {
        this.addLog('info', `Starting MCP server: ${mcpConfig.command} ${mcpConfig.args.join(' ')}`, 'mcp-server');

        this.mcpServerProcess = spawn(mcpConfig.command, mcpConfig.args, {
          env: { ...process.env, ...mcpConfig.env },
          stdio: ['pipe', 'pipe', 'pipe']
        });

        this.mcpServerProcess.stdout?.on('data', (data) => {
          const message = data.toString().trim();
          this.addLog('info', message, 'mcp-server');
        });

        this.mcpServerProcess.stderr?.on('data', (data) => {
          const message = data.toString().trim();
          this.addLog('error', message, 'mcp-server');
        });

        this.mcpServerProcess.on('spawn', () => {
          this.addLog('info', `MCP server started with PID: ${this.mcpServerProcess?.pid}`, 'mcp-server');
          resolve({
            success: true,
            processId: this.mcpServerProcess?.pid
          });
        });

        this.mcpServerProcess.on('error', (error) => {
          this.addLog('error', `MCP server error: ${error.message}`, 'mcp-server');
          resolve({
            success: false,
            error: error.message
          });
        });

        this.mcpServerProcess.on('exit', (code, signal) => {
          this.addLog('warn', `MCP server exited with code ${code}, signal ${signal}`, 'mcp-server');
          this.mcpServerProcess = null;
        });
      } catch (error: any) {
        resolve({
          success: false,
          error: error.message
        });
      }
    });
  }

  private async launchClaudeDesktop(claudePath: string): Promise<MCPLaunchResult> {
    return new Promise((resolve) => {
      try {
        const platform = process.platform;
        let command: string;
        let args: string[] = [];

        if (platform === 'darwin') {
          command = 'open';
          args = ['-a', claudePath];
        } else if (platform === 'win32') {
          command = claudePath;
        } else {
          command = claudePath;
        }

        this.addLog('info', `Launching Claude Desktop: ${command} ${args.join(' ')}`, 'claude-desktop');

        this.claudeDesktopProcess = spawn(command, args, {
          detached: true,
          stdio: 'ignore'
        });

        this.claudeDesktopProcess.on('spawn', () => {
          this.addLog('info', `Claude Desktop launched with PID: ${this.claudeDesktopProcess?.pid}`, 'claude-desktop');
          resolve({
            success: true,
            processId: this.claudeDesktopProcess?.pid
          });
        });

        this.claudeDesktopProcess.on('error', (error) => {
          this.addLog('error', `Claude Desktop error: ${error.message}`, 'claude-desktop');
          resolve({
            success: false,
            error: error.message
          });
        });

        this.claudeDesktopProcess.on('exit', (code, signal) => {
          this.addLog('info', `Claude Desktop exited with code ${code}, signal ${signal}`, 'claude-desktop');
          this.claudeDesktopProcess = null;
        });

        // For macOS and Windows, the process might exit immediately after spawning
        // but the app continues running, so we'll consider it successful
        setTimeout(() => {
          if (this.claudeDesktopProcess) {
            resolve({
              success: true,
              processId: this.claudeDesktopProcess.pid
            });
          }
        }, 3000);
      } catch (error: any) {
        resolve({
          success: false,
          error: error.message
        });
      }
    });
  }

  private async stopMCPServer(): Promise<boolean> {
    try {
      if (this.mcpServerProcess && !this.mcpServerProcess.killed) {
        const process = this.mcpServerProcess; // Store reference before setting to null
        process.kill('SIGTERM');
        
        // Wait for graceful shutdown
        await this.sleep(2000);
        
        // Check if process still exists and is not killed
        if (process && !process.killed) {
          process.kill('SIGKILL');
        }
        
        this.mcpServerProcess = null;
        this.addLog('info', 'MCP server stopped', 'mcp-server');
      }
      return true;
    } catch (error: any) {
      this.addLog('error', `Error stopping MCP server: ${error.message}`, 'launcher');
      return false;
    }
  }

  private async stopClaudeDesktop(): Promise<boolean> {
    try {
      if (this.claudeDesktopProcess && !this.claudeDesktopProcess.killed) {
        this.claudeDesktopProcess.kill('SIGTERM');
        this.claudeDesktopProcess = null;
        this.addLog('info', 'Claude Desktop stopped', 'claude-desktop');
      }
      return true;
    } catch (error: any) {
      this.addLog('error', `Error stopping Claude Desktop: ${error.message}`, 'launcher');
      return false;
    }
  }

  private addLog(level: MCPLog['level'], message: string, source: MCPLog['source']): void {
    const logEntry: MCPLog = {
      timestamp: new Date(),
      level,
      message,
      source
    };

    this.logs.push(logEntry);

    // Keep only the last maxLogs entries
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Also log to electron-log
    log[level](`[${source}] ${message}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
} 