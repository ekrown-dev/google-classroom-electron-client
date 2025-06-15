import * as http from 'http';
import WebSocket from 'ws';
import * as crypto from 'crypto';
import log from 'electron-log';
import { SupabaseService } from './supabase-service.js';
import { CredentialService } from './credential-service.js';

interface BridgeConfig {
  port: number;
  authToken: string;
  mcpServerUrl: string;
}

interface AuthenticatedClient {
  socket: WebSocket;
  sessionId: string;
  authenticated: boolean;
  lastActivity: Date;
}

export class MCPBridgeService {
  private httpServer: http.Server | null = null;
  private wsServer: WebSocket.Server | null = null;
  private supabaseService: SupabaseService;
  private credentialService: CredentialService;
  private config: BridgeConfig;
  private authenticatedClients: Map<string, AuthenticatedClient> = new Map();
  private sessionTimeout = 30 * 60 * 1000; // 30 minutes
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(supabaseService: SupabaseService, credentialService: CredentialService) {
    this.supabaseService = supabaseService;
    this.credentialService = credentialService;
    
    // Generate secure configuration
    this.config = {
      port: parseInt(process.env.MCP_BRIDGE_PORT || '5123'),
      authToken: this.generateSecureToken(),
      mcpServerUrl: process.env.MCP_SERVER_URL || 'https://mcp.ekrown.com'
    };
  }

  private generateSecureToken(): string {
    // Generate token compatible with MCP server auth middleware
    const sharedSecret = process.env.ELECTRON_BRIDGE_SECRET || 'default-shared-secret';
    return crypto.createHmac('sha256', sharedSecret)
                 .update('electron-bridge-token')
                 .digest('hex');
  }

  async startBridge(): Promise<{ success: boolean; config?: BridgeConfig; error?: string }> {
    try {
      log.info('[MCP Bridge] Starting secure bridge service...');

      // Verify license before starting bridge
      const licenseResult = await this.verifyLicense();
      if (!licenseResult.success) {
        return { success: false, error: licenseResult.error };
      }

      // Create HTTP server
      this.httpServer = http.createServer();
      
      // Create WebSocket server
      this.wsServer = new WebSocket.Server({
        server: this.httpServer,
        verifyClient: (info: any) => this.verifyClient(info)
      });

      // Setup WebSocket handlers
      this.wsServer.on('connection', (ws) => {
        this.handleNewConnection(ws);
      });

      // Setup HTTP endpoints
      this.setupHttpEndpoints();

      // Start server
      await new Promise<void>((resolve, reject) => {
        this.httpServer!.listen(this.config.port, 'localhost', () => {
          log.info(`[MCP Bridge] Bridge service started on localhost:${this.config.port}`);
          resolve();
        });
        
        this.httpServer!.on('error', (error) => {
          log.error('[MCP Bridge] Failed to start bridge service:', error);
          reject(error);
        });
      });

      // Start cleanup interval for expired sessions
      this.startSessionCleanup();

      return {
        success: true,
        config: this.config
      };

    } catch (error: any) {
      log.error('[MCP Bridge] Error starting bridge service:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async stopBridge(): Promise<{ success: boolean; error?: string }> {
    try {
      log.info('[MCP Bridge] Stopping bridge service...');

      // Stop cleanup interval
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
        this.cleanupInterval = null;
      }

      // Close all authenticated connections
      for (const [, client] of this.authenticatedClients) {
        client.socket.close(1000, 'Bridge service shutting down');
      }
      this.authenticatedClients.clear();

      // Close WebSocket server
      if (this.wsServer) {
        this.wsServer.close();
        this.wsServer = null;
      }

      // Close HTTP server
      if (this.httpServer) {
        await new Promise<void>((resolve) => {
          this.httpServer!.close(() => {
            log.info('[MCP Bridge] Bridge service stopped');
            resolve();
          });
        });
        this.httpServer = null;
      }

      return { success: true };

    } catch (error: any) {
      log.error('[MCP Bridge] Error stopping bridge service:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  private async verifyLicense(): Promise<{ success: boolean; error?: string }> {
    try {
      const licenseStatus = await this.supabaseService.getLicenseStatus();
      
      if (!licenseStatus.success) {
        return {
          success: false,
          error: 'Failed to verify license status'
        };
      }

      // Allow both active subscriptions and trial periods
      if (licenseStatus.status !== 'active' && licenseStatus.status !== 'trial') {
        return {
          success: false,
          error: 'Active subscription or trial required to use MCP bridge'
        };
      }

      // For trial users, check if trial period is still valid
      if (licenseStatus.status === 'trial') {
        if (licenseStatus.daysRemaining !== undefined && licenseStatus.daysRemaining <= 0) {
          return {
            success: false,
            error: 'Trial period has expired. Please upgrade to continue using MCP bridge'
          };
        }
        log.info(`[MCP Bridge] Trial user detected, ${licenseStatus.daysRemaining || 'unknown'} days remaining`);
      }

      return { success: true };

    } catch (error: any) {
      log.error('[MCP Bridge] License verification failed:', error);
      return {
        success: false,
        error: 'License verification failed'
      };
    }
  }

  private verifyClient(info: any): boolean {
    // Only allow connections from localhost
    const host = info.req.headers.host;
    const isLocalhost = host === `localhost:${this.config.port}` || host === `127.0.0.1:${this.config.port}`;
    
    if (!isLocalhost) {
      log.warn(`[MCP Bridge] Rejected connection from non-localhost host: ${host}`);
      return false;
    }

    return true;
  }

  private handleNewConnection(ws: WebSocket): void {
    const sessionId = crypto.randomUUID();
    log.info(`[MCP Bridge] New connection attempt, session: ${sessionId}`);

    // Wait for authentication message
    const authTimeout = setTimeout(() => {
      log.warn(`[MCP Bridge] Authentication timeout for session: ${sessionId}`);
      ws.close(1008, 'Authentication timeout');
    }, 10000); // 10 seconds to authenticate

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'auth' && !this.authenticatedClients.has(sessionId)) {
          clearTimeout(authTimeout);
          await this.handleAuthentication(ws, sessionId, message);
        } else if (this.authenticatedClients.has(sessionId)) {
          await this.handleMCPMessage(sessionId, message);
        } else {
          log.warn(`[MCP Bridge] Unauthenticated message from session: ${sessionId}`);
          ws.close(1008, 'Authentication required');
        }
      } catch (error) {
        log.error(`[MCP Bridge] Error processing message from session ${sessionId}:`, error);
        ws.close(1011, 'Message processing error');
      }
    });

    ws.on('close', () => {
      clearTimeout(authTimeout);
      this.authenticatedClients.delete(sessionId);
      log.info(`[MCP Bridge] Session ${sessionId} disconnected`);
    });

    ws.on('error', (error) => {
      log.error(`[MCP Bridge] WebSocket error for session ${sessionId}:`, error);
      clearTimeout(authTimeout);
      this.authenticatedClients.delete(sessionId);
    });
  }

  private async handleAuthentication(ws: WebSocket, sessionId: string, message: any): Promise<void> {
    try {
      // Verify auth token
      if (message.token !== this.config.authToken) {
        log.warn(`[MCP Bridge] Invalid auth token for session: ${sessionId}`);
        ws.close(1008, 'Invalid authentication token');
        return;
      }

      // Re-verify license on each authentication
      const licenseResult = await this.verifyLicense();
      if (!licenseResult.success) {
        log.warn(`[MCP Bridge] License verification failed for session: ${sessionId}`);
        ws.close(1008, 'License verification failed');
        return;
      }

      // Store authenticated client
      this.authenticatedClients.set(sessionId, {
        socket: ws,
        sessionId,
        authenticated: true,
        lastActivity: new Date()
      });

      log.info(`[MCP Bridge] Session ${sessionId} authenticated successfully`);

      // Send authentication success
      ws.send(JSON.stringify({
        type: 'auth_success',
        sessionId,
        message: 'Authentication successful'
      }));

    } catch (error: any) {
      log.error(`[MCP Bridge] Authentication error for session ${sessionId}:`, error);
      ws.close(1011, 'Authentication processing error');
    }
  }

  private async handleMCPMessage(sessionId: string, message: any): Promise<void> {
    const client = this.authenticatedClients.get(sessionId);
    if (!client) {
      log.warn(`[MCP Bridge] Message from unauthenticated session: ${sessionId}`);
      return;
    }

    try {
      // Update last activity
      client.lastActivity = new Date();

      // Forward message to MCP server with authentication
      const response = await this.forwardToMCPServer(message);
      
      // Send response back to Claude-desktop
      client.socket.send(JSON.stringify(response));

    } catch (error: any) {
      log.error(`[MCP Bridge] Error forwarding message for session ${sessionId}:`, error);
      
      // Send error response to Claude-desktop
      client.socket.send(JSON.stringify({
        id: message.id,
        error: {
          code: -32603,
          message: 'Internal error forwarding to MCP server'
        }
      }));
    }
  }

  private async forwardToMCPServer(message: any): Promise<any> {
    // Load credentials for MCP server authentication
    const credentialResult = await this.credentialService.loadCredentials();
    if (!credentialResult.success || !credentialResult.credentials) {
      throw new Error('No credentials available for MCP server authentication');
    }

    // Get user license information
    const licenseStatus = await this.supabaseService.getLicenseStatus();
    const currentUser = await this.supabaseService.getCurrentUser();

    // Add authentication headers
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.authToken}`,
      'X-Electron-Bridge': 'true',
      'X-Session-Id': crypto.randomUUID(),
      'X-User-Id': currentUser.success && currentUser.user ? currentUser.user.id : '',
      'X-License-Status': licenseStatus.success ? (licenseStatus.status || 'none') : 'none'
    };

    // Forward to MCP server (implement HTTP/WebSocket forwarding based on server type)
    const response = await fetch(`${this.config.mcpServerUrl}/api/mcp`, {
      method: 'POST',
      headers,
      body: JSON.stringify(message)
    });

    if (!response.ok) {
      throw new Error(`MCP server responded with status: ${response.status}`);
    }

    return await response.json();
  }

  private setupHttpEndpoints(): void {
    if (!this.httpServer) return;

    this.httpServer.on('request', (req, res) => {
      // Enable CORS for localhost only
      res.setHeader('Access-Control-Allow-Origin', 'http://localhost:*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'healthy',
          service: 'MCP Bridge Service',
          authenticatedClients: this.authenticatedClients.size,
          timestamp: new Date().toISOString()
        }));
        return;
      }

      if (req.url === '/config' && req.method === 'GET') {
        // Return configuration for Claude-desktop (excluding sensitive data)
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          websocketUrl: `ws://localhost:${this.config.port}`,
          authToken: this.config.authToken
        }));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    });
  }

  private startSessionCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = new Date();
      const expiredSessions: string[] = [];

      for (const [sessionId, client] of this.authenticatedClients) {
        const timeSinceActivity = now.getTime() - client.lastActivity.getTime();
        
        if (timeSinceActivity > this.sessionTimeout) {
          expiredSessions.push(sessionId);
        }
      }

      for (const sessionId of expiredSessions) {
        const client = this.authenticatedClients.get(sessionId);
        if (client) {
          log.info(`[MCP Bridge] Closing expired session: ${sessionId}`);
          client.socket.close(1000, 'Session expired');
          this.authenticatedClients.delete(sessionId);
        }
      }

      if (expiredSessions.length > 0) {
        log.info(`[MCP Bridge] Cleaned up ${expiredSessions.length} expired sessions`);
      }
    }, 60000); // Check every minute
  }

  getStatus(): {
    isRunning: boolean;
    port?: number;
    authenticatedClients?: number;
    config?: Partial<BridgeConfig>;
  } {
    return {
      isRunning: this.httpServer !== null,
      port: this.config.port,
      authenticatedClients: this.authenticatedClients.size,
      config: {
        port: this.config.port,
        authToken: this.config.authToken.substring(0, 8) + '...' // Partial token for debugging
      }
    };
  }

  getBridgeConfig(): BridgeConfig {
    return { ...this.config };
  }
}