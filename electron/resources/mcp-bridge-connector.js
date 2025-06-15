#!/usr/bin/env node

const WebSocket = require('ws');

class MCPBridgeConnector {
  constructor() {
    this.bridgeUrl = process.env.MCP_BRIDGE_URL || 'ws://localhost:5123';
    this.bridgeToken = process.env.MCP_BRIDGE_TOKEN || 'default-token';
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

const connector = new MCPBridgeConnector();
connector.connect();