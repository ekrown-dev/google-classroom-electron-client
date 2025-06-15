// Load environment variables first
import { config } from 'dotenv';
config();

// Set NODE_ENV to development if not set
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'development';
}

import { app, BrowserWindow, ipcMain, shell, dialog, Menu } from 'electron';
import pkg from 'electron-updater';
const { autoUpdater } = pkg;
import log from 'electron-log';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { SupabaseService } from './services/supabase-service.js';
import { ClaudeDetectionService } from './services/claude-detection-service.js';
import { CredentialService } from './services/credential-service.js';
import { MCPLauncherService } from './services/mcp-launcher-service.js';
import { StripeService } from './services/stripe-service.js';
import { MCPBridgeService } from './services/mcp-bridge-service.js';
import express from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure logging
log.transports.file.level = 'info';
autoUpdater.logger = log;

class GoogleClassroomMCPApp {
  private mainWindow: BrowserWindow | null = null;
  private supabaseService: SupabaseService | null = null;
  private claudeDetectionService: ClaudeDetectionService | null = null;
  private credentialService: CredentialService | null = null;
  private mcpLauncherService: MCPLauncherService | null = null;
  private stripeService: StripeService | null = null;
  private mcpBridgeService: MCPBridgeService | null = null;

  constructor() {
    try {
      this.supabaseService = new SupabaseService();
      this.claudeDetectionService = new ClaudeDetectionService();
      this.credentialService = new CredentialService();
      this.mcpBridgeService = new MCPBridgeService(this.supabaseService, this.credentialService);
      this.mcpLauncherService = new MCPLauncherService(this.mcpBridgeService);
      this.stripeService = new StripeService();
      
      log.info('All services initialized successfully');
    } catch (error) {
      log.error('Error initializing services:', error);
      // Continue with app initialization even if services fail
    }
    
    // Setup deep linking before the app is ready
    this.setupDeepLinking();

    this.initializeApp();
  }

  private async initializeApp(): Promise<void> {
    // Wait for app to be ready
    await app.whenReady();
    
    // Setup IPC handlers BEFORE creating window
    this.setupIpcHandlers();
    
    // Create main window
    await this.createMainWindow();
    
    // Setup menu
    this.setupMenu();
    
    // Check for updates
    this.checkForUpdates();
    
    // App event handlers
    this.setupAppEventHandlers();
  }

  private async createMainWindow(): Promise<void> {
    // Commented out for testing - users should stay logged in between sessions
    // if (process.env.NODE_ENV === 'development') {
    //   try {
    //     log.info('[DEV MODE] Clearing Supabase session...');
    //     await this.supabaseService.signOut();
    //     log.info('[DEV MODE] Clearing local credentials...');
    //     await this.credentialService.clearCredentials();
    //     log.info('[DEV MODE] Session and credentials cleared for development.');
    //   } catch (error) {
    //     log.error('[DEV MODE] Error clearing session/credentials:', error);
    //   }
    // }

    const preloadPath = path.resolve(__dirname, 'preload.cjs');
    
    // Verify preload script exists
    if (!fs.existsSync(preloadPath)) {
      log.error(`Preload script not found at: ${preloadPath}`);
      console.error(`Preload script not found at: ${preloadPath}`);
    } else {
      log.info(`Preload script found at: ${preloadPath}`);
      console.log(`Preload script found at: ${preloadPath}`);
    }
    
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
        preload: preloadPath,
        webSecurity: true
      },
      titleBarStyle: 'default'
    });

    try {
      await this.mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    } catch (error) {
      log.error('Error loading file into main window:', error);
      console.error('Error loading file into main window:', error);
    }

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });

    // Handle initial deep link on cold start (macOS)
    app.on('open-url', (event, url) => {
        event.preventDefault();
        dialog.showErrorBox('Welcome Back', `You arrived from: ${url}`);
        // Here you would parse the URL and handle the auth token
    });

    this.mainWindow.webContents.setWindowOpenHandler(({ url }: { url: string }) => {
      shell.openExternal(url);
      return { action: 'deny' };
    });
  }

  private setupIpcHandlers(): void {
    log.info('Setting up IPC handlers...');
    
    try {
      // Auth & Licensing (M1, M2)
      ipcMain.handle('supabase:signIn', async (_: any, email: string, password: string) => {
        if (!this.supabaseService) {
          return { success: false, error: 'Supabase service not initialized' };
        }
        return await this.supabaseService.signIn(email, password);
      });

    ipcMain.handle('supabase:signUp', async (_: any, email: string, password: string, metadata: {
      firstName: string;
      lastName: string;
      organization?: string;
    }) => {
      if (!this.supabaseService) {
        return { success: false, error: 'Supabase service not initialized' };
      }
      return await this.supabaseService.signUp(email, password, metadata);
    });

    ipcMain.handle('supabase:signOut', async () => {
      if (!this.supabaseService) {
        return { success: false, error: 'Supabase service not initialized' };
      }
      return await this.supabaseService.signOut();
    });

    ipcMain.handle('supabase:getCurrentUser', async () => {
      if (!this.supabaseService) {
        return { success: false, error: 'Supabase service not initialized' };
      }
      return await this.supabaseService.getCurrentUser();
    });

    ipcMain.handle('supabase:getLicenseStatus', async () => {
      if (!this.supabaseService) {
        return { success: false, error: 'Supabase service not initialized' };
      }
      return await this.supabaseService.getLicenseStatus();
    });

    ipcMain.handle('supabase:getUserMetadata', async () => {
      if (!this.supabaseService) {
        return { success: false, error: 'Supabase service not initialized' };
      }
      return await this.supabaseService.getUserMetadata();
    });

    // Setup completion tracking
    ipcMain.handle('supabase:updateSetupCompletion', async (_: any, completed: boolean) => {
      try {
        if (!this.supabaseService) {
          return { success: false, error: 'Supabase service not initialized' };
        }
        const result = await this.supabaseService.updateSetupCompletion(completed);
        log.info('Setup completion update result:', result);
        return result;
      } catch (error: any) {
        const errorMessage = this.formatErrorMessage(error);
        log.error('Setup completion update error:', errorMessage);
        return { success: false, error: errorMessage };
      }
    });

    ipcMain.handle('supabase:getSetupCompletion', async () => {
      if (!this.supabaseService) {
        return { success: false, error: 'Supabase service not initialized' };
      }
      return await this.supabaseService.getSetupCompletion();
    });

    // Session management handlers
    ipcMain.handle('supabase:refreshSession', async () => {
      if (!this.supabaseService) {
        return { success: false, error: 'Supabase service not initialized' };
      }
      return await this.supabaseService.refreshSession();
    });

    ipcMain.handle('supabase:isAuthenticated', async () => {
      if (!this.supabaseService) {
        return { success: false, isAuthenticated: false, error: 'Supabase service not initialized' };
      }
      const isAuth = this.supabaseService.isAuthenticated();
      return { success: true, isAuthenticated: isAuth };
    });

    // Stripe billing
    ipcMain.handle('stripe:createCheckoutSession', async (_: any, priceId: string, userIdFromRenderer: string) => {
      if (!this.stripeService || !this.supabaseService) {
        return { success: false, error: 'Services not initialized' };
      }
      log.info(`IPC stripe:createCheckoutSession received. Price ID: ${priceId}, User ID from renderer: ${userIdFromRenderer}`);
      const userSession = await this.supabaseService.getCurrentUser();
      let customerEmail: string | undefined;
      let stripeCustomerId: string | undefined; // This would be if you store Stripe Customer ID in Supabase

      if (userSession && userSession.success && userSession.user) {
        customerEmail = userSession.user.email;
        // Example: If you store stripe_customer_id on a user_profile table linked to user.id
        // const userProfile = await this.supabaseService.getUserProfile(userSession.user.id);
        // if (userProfile && userProfile.stripe_customer_id) { 
        //   stripeCustomerId = userProfile.stripe_customer_id;
        //   log.info(`Found existing Stripe Customer ID: ${stripeCustomerId} for user ${userSession.user.id}`);
        // }
      }

      const finalUserId = userIdFromRenderer || (userSession?.success && userSession?.user?.id);

      if (!finalUserId) {
        log.error('stripe:createCheckoutSession Error: User ID is missing and could not be determined.');
        return { success: false, error: 'User ID is required to create Stripe Checkout session. Please ensure you are logged in.' };
      }
      
      log.info(`Proceeding to create Stripe Checkout session for User ID: ${finalUserId}, Price ID: ${priceId}, Customer Email: ${customerEmail}, Stripe Customer ID (if any): ${stripeCustomerId}`);
      return await this.stripeService.createCheckoutSession(priceId, finalUserId, stripeCustomerId, customerEmail);
    });

    ipcMain.handle('stripe:getSubscriptionStatus', async () => {
      if (!this.stripeService || !this.supabaseService) {
        return { isActive: false, error: 'Services not initialized' };
      }
      // This likely needs the Stripe Customer ID, which should be retrieved based on the Supabase user.
      // For now, assuming stripeService or supabaseService handles this mapping.
      // Consider passing userId or stripeCustomerId from renderer if readily available.
      const user = await this.supabaseService.getCurrentUser();
      if (user && user.success && user.user && user.user.app_metadata?.stripe_customer_id) {
        log.info(`IPC stripe:getSubscriptionStatus: Found stripe_customer_id ${user.user.app_metadata.stripe_customer_id} in user app_metadata.`);
        return await this.stripeService.getSubscriptionStatus(user.user.app_metadata.stripe_customer_id);
      } else if (user && user.success && user.user) {
        // Fallback: try to get customer by email if you don't store stripe_customer_id
        // This is less reliable if emails can change or aren't unique in Stripe
        log.warn(`IPC stripe:getSubscriptionStatus: stripe_customer_id not found in user app_metadata for ${user.user.id}. Attempting lookup by email as a fallback (less reliable).`);
        const customerByEmail = await this.stripeService.getCustomerByEmail(user.user.email!);
        if (customerByEmail.success && customerByEmail.customerId) {
            log.info(`Found Stripe customer by email: ${customerByEmail.customerId}`);
            return await this.stripeService.getSubscriptionStatus(customerByEmail.customerId);
        } else {
            log.error('IPC stripe:getSubscriptionStatus: Could not find Stripe customer ID in metadata or by email.');
             return { isActive: false, error: 'Stripe customer ID not found for user.' };
        }
      }
      log.error('IPC stripe:getSubscriptionStatus: User not authenticated or Stripe customer ID missing.');
      return { isActive: false, error: 'User not authenticated or Stripe customer ID missing.' };
    });
    
    ipcMain.handle('stripe:getAvailablePlans', async () => {
        if (!this.stripeService) {
          return { success: false, error: 'Stripe service not initialized' };
        }
        return await this.stripeService.getAvailablePlans();
    });

    // Add handler to update license from Stripe subscription
    ipcMain.handle('stripe:updateLicenseFromPayment', async (_: any, subscriptionId: string, customerId: string) => {
      if (!this.stripeService || !this.supabaseService) {
        return { success: false, error: 'Services not initialized' };
      }
      
      try {
        // Get subscription details from Stripe
        const subscriptionStatus = await this.stripeService.getSubscriptionStatus(customerId);
        
        if (subscriptionStatus.isActive && subscriptionStatus.subscriptionId) {
          // Update license in Supabase
          const updateResult = await this.supabaseService.updateLicenseFromStripe(
            subscriptionStatus.subscriptionId,
            'active'
          );
          
          if (updateResult.success) {
            log.info('Successfully updated license after payment');
            return { success: true };
          } else {
            log.error('Failed to update license:', updateResult.error);
            return { success: false, error: updateResult.error };
          }
        } else {
          return { success: false, error: 'Subscription is not active' };
        }
      } catch (error: any) {
        log.error('Error updating license from payment:', error);
        return { success: false, error: error.message };
      }
    });

    // Add handler to refresh license status
    ipcMain.handle('license:refresh', async () => {
      if (!this.supabaseService) {
        return { success: false, error: 'Supabase service not initialized' };
      }
      return await this.supabaseService.getLicenseStatus();
    });

    // Add handler to check subscription status after payment
    ipcMain.handle('subscription:checkAfterPayment', async () => {
      if (!this.supabaseService || !this.stripeService) {
        return { success: false, error: 'Services not initialized' };
      }
      
      try {
        // Get current user
        const userResult = await this.supabaseService.getCurrentUser();
        if (!userResult.success || !userResult.user) {
          return { success: false, error: 'User not authenticated' };
        }

        // Try to get customer by email and check subscription
        const customerResult = await this.stripeService.getCustomerByEmail(userResult.user.email!);
        if (customerResult.success && customerResult.customerId) {
          const subscriptionStatus = await this.stripeService.getSubscriptionStatus(customerResult.customerId);
          
          log.info('Subscription status check:', {
            isActive: subscriptionStatus.isActive,
            subscriptionId: subscriptionStatus.subscriptionId,
            status: subscriptionStatus.status,
            customerId: customerResult.customerId
          });
          
          if (subscriptionStatus.isActive && subscriptionStatus.subscriptionId) {
            // Update license in Supabase with both subscription and customer ID
            const updateResult = await this.supabaseService.updateLicenseFromStripe(
              subscriptionStatus.subscriptionId,
              subscriptionStatus.status === 'trialing' ? 'trial' : 'active',
              userResult.user.id,
              customerResult.customerId
            );
            
            log.info('License update result:', updateResult);
            
            if (updateResult.success) {
              log.info('Successfully updated license after payment check');
              return { success: true, subscriptionActive: true };
            } else {
              log.error('Failed to update license:', updateResult.error);
              return { success: false, error: updateResult.error };
            }
          }
        }
        
        return { success: true, subscriptionActive: false };
      } catch (error: any) {
        log.error('Error checking subscription after payment:', error);
        return { success: false, error: error.message };
      }
    });


    // Claude Detection (M3)
    ipcMain.handle('claude:detect', async () => {
      if (!this.claudeDetectionService) {
        return { success: false, error: 'Claude detection service not initialized' };
      }
      return await this.claudeDetectionService.detectClaudeDesktop();
    });

    ipcMain.handle('claude:validate', async () => {
      if (!this.claudeDetectionService) {
        return { success: false, error: 'Claude detection service not initialized' };
      }
      return await this.claudeDetectionService.validateClaudeVersion();
    });

    ipcMain.handle('claude:getInstallInstructions', async () => {
      if (!this.claudeDetectionService) {
        return { success: false, error: 'Claude detection service not initialized' };
      }
      return this.claudeDetectionService.getInstallInstructions();
    });

    // Credential Management (M4)
    ipcMain.handle('credentials:save', async (_: any, credentials: any) => {
      if (!this.credentialService || !this.supabaseService) {
        return { success: false, error: 'Services not initialized' };
      }
      
      // Set current user ID for user-specific credentials
      const userResult = await this.supabaseService.getCurrentUser();
      if (!userResult.success || !userResult.user) {
        return { success: false, error: 'User not authenticated' };
      }
      
      this.credentialService.setCurrentUserId(userResult.user.id);
      return await this.credentialService.saveCredentials(credentials);
    });

    ipcMain.handle('credentials:load', async () => {
      try {
        if (!this.credentialService || !this.supabaseService) {
          return { success: false, error: 'Services not initialized' };
        }
        
        // Set current user ID for user-specific credentials
        const userResult = await this.supabaseService.getCurrentUser();
        if (!userResult.success || !userResult.user) {
          return { success: false, error: 'User not authenticated' };
        }
        
        this.credentialService.setCurrentUserId(userResult.user.id);
        log.info('Loading credentials for user:', userResult.user.id);
        
        const credentialResult = await this.credentialService.loadCredentials();
        log.info('Credential load result:', credentialResult.success ? 'Success' : `Failed: ${credentialResult.error}`);
        return credentialResult;
      } catch (error: any) {
        const errorMessage = this.formatErrorMessage(error);
        log.error('Error loading credentials:', errorMessage);
        return { success: false, error: errorMessage };
      }
    });

    ipcMain.handle('credentials:clear', async () => {
      if (!this.credentialService) {
        return { success: false, error: 'Credential service not initialized' };
      }
      return await this.credentialService.clearCredentials();
    });

    ipcMain.handle('credentials:validate', async (_: any, credentials: any) => {
      // Add basic validation - you can expand this based on your needs
      try {
        return {
          success: true,
          valid: credentials && credentials.client_id && credentials.client_secret
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    // MCP Client Launch (M5)
    ipcMain.handle('mcp:launch', async () => {
      if (!this.mcpLauncherService) {
        return { success: false, error: 'MCP launcher service not initialized' };
      }
      return await this.mcpLauncherService.launchClaudeWithMCP();
    });

    ipcMain.handle('mcp:stop', async () => {
      if (!this.mcpLauncherService) {
        return { success: false, error: 'MCP launcher service not initialized' };
      }
      return await this.mcpLauncherService.stopMCP();
    });

    // Keep both handlers for backward compatibility
    ipcMain.handle('mcp:shutdown', async () => {
      if (!this.mcpLauncherService) {
        return { success: false, error: 'MCP launcher service not initialized' };
      }
      return await this.mcpLauncherService.stopMCP();
    });

    ipcMain.handle('mcp:getStatus', async () => {
      if (!this.mcpLauncherService) {
        return { isRunning: false, error: 'MCP launcher service not initialized' };
      }
      return this.mcpLauncherService.getStatus();
    });

    ipcMain.handle('mcp:getLogs', async () => {
      // Add MCP logs functionality - placeholder for now
      return { success: true, logs: [] };
    });

    // MCP Bridge Service Handlers
    ipcMain.handle('bridge:start', async () => {
      if (!this.mcpBridgeService) {
        return { success: false, error: 'MCP bridge service not initialized' };
      }
      return await this.mcpBridgeService.startBridge();
    });

    ipcMain.handle('bridge:stop', async () => {
      if (!this.mcpBridgeService) {
        return { success: false, error: 'MCP bridge service not initialized' };
      }
      return await this.mcpBridgeService.stopBridge();
    });

    ipcMain.handle('bridge:getStatus', async () => {
      if (!this.mcpBridgeService) {
        return { isRunning: false, error: 'MCP bridge service not initialized' };
      }
      return this.mcpBridgeService.getStatus();
    });

    ipcMain.handle('bridge:getConfig', async () => {
      if (!this.mcpBridgeService) {
        return { success: false, error: 'MCP bridge service not initialized' };
      }
      return {
        success: true,
        config: this.mcpBridgeService.getBridgeConfig()
      };
    });

    // System utilities
    ipcMain.handle('system:getSystemInfo', async () => {
      return {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        electronVersion: process.versions.electron,
        chromeVersion: process.versions.chrome,
        appVersion: app.getVersion(),
        appName: app.getName()
      };
    });

    ipcMain.handle('system:openExternal', async (_, url: string) => {
      return await shell.openExternal(url);
    });

    ipcMain.handle('system:showItemInFolder', async (_, path: string) => {
      return shell.showItemInFolder(path);
    });

    ipcMain.handle('system:exportLogs', async () => {
      // For now, return a placeholder - could implement log export later
      return { success: false, error: 'Log export not implemented yet' };
    });
    
    ipcMain.handle('app:getVersion', () => {
      return app.getVersion();
    });

    ipcMain.handle('app:restart', () => {
      app.relaunch();
      app.exit();
    });

    ipcMain.handle('app:checkForUpdates', async () => {
      return await this.checkForUpdates();
    });

    ipcMain.on('app:quit', () => {
        app.quit();
    });

    ipcMain.on('app:openExternalUrl', (event, url) => {
        shell.openExternal(url);
    });

    ipcMain.handle('dialog:showErrorBox', (event, title, content) => {
        dialog.showErrorBox(title, content);
    });
    
    ipcMain.handle('dialog:showMessageBox', async (event, options) => {
        if (this.mainWindow) {
            return await dialog.showMessageBox(this.mainWindow, options);
        }
        return await dialog.showMessageBox(options); // Fallback if no mainWindow
    });

    // Debug handler for testing auth callbacks
    ipcMain.handle('auth:testCallback', async (_, url: string) => {
      if (!this.supabaseService) {
        return { success: false, error: 'Supabase service not initialized' };
      }
      log.info('Testing auth callback with URL:', url);
      return await this.supabaseService.handleAuthCallback(url);
    });

    log.info('IPC handlers setup completed successfully');
    } catch (error) {
      log.error('Error setting up IPC handlers:', error);
      throw error;
    }
  }

  private setupMenu(): void {
    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: 'eKROWN',
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          {
            label: 'Check for Updates...',
            click: async () => {
              await this.checkForUpdates();
            }
          },
          { type: 'separator' },
          {
            label: 'Quit',
            accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
            click: () => app.quit()
          }
        ]
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          ...(process.platform === 'darwin' ? [
            { role: 'pasteAndMatchStyle' as const },
            { role: 'delete' as const },
            { role: 'selectAll' as const },
            { type: 'separator' as const },
            {
              label: 'Speech',
              submenu: [
                { role: 'startSpeaking' as const },
                { role: 'stopSpeaking' as const }
              ]
            }
          ] : [
            { role: 'delete' as const },
            { type: 'separator' as const },
            { role: 'selectAll' as const }
          ])
        ]
      },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'forceReload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' }
        ]
      },
      {
        label: 'Window',
        submenu: [
          { role: 'minimize' },
          { role: 'zoom' },
          ...(process.platform === 'darwin' ? [
            { type: 'separator' as const },
            { role: 'front' as const },
            { type: 'separator' as const },
            { role: 'window' as const }
          ] : [
            { role: 'close' as const }
          ])
        ]
      },
      {
        label: 'Help',
        submenu: [
          {
            label: 'About ' + app.getName(),
            click: () => this.mainWindow?.webContents.send('show-about-dialog') 
          },
          {
            label: 'Documentation',
            click: () => shell.openExternal('https://docs.ekrown.com/google-classroom-mcp') // Replace with your actual docs URL
          },
          {
            label: 'Support',
            click: () => shell.openExternal('https://support.ekrown.com') // Replace with your actual support URL
          }
        ]
      }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }

  private async checkForUpdates(): Promise<any> {
    try {
      if (process.env.NODE_ENV === 'development') {
        log.info('Skipping update check in development mode');
        return { available: false, reason: 'development' };
      }
      log.info('Checking for updates...');
      const result = await autoUpdater.checkForUpdatesAndNotify();
      log.info('Update check result:', result);
      return result;
    } catch (error: any) {
      log.error('Error checking for updates:', error);
      this.mainWindow?.webContents.send('update-status', { type: 'error', error: error?.message || 'Unknown error during update check' });
      return { error: error?.message || 'Unknown error' };
    }
  }

  private setupAppEventHandlers(): void {
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    app.on('activate', async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        await this.createMainWindow();
      }
    });

    // Auto-updater events
    autoUpdater.on('checking-for-update', () => {
      log.info('Checking for update...');
      this.mainWindow?.webContents.send('update-status', { type: 'checking' });
    });

    autoUpdater.on('update-available', (info: any) => {
      log.info('Update available:', info);
      this.mainWindow?.webContents.send('update-status', { type: 'available', info });
    });

    autoUpdater.on('update-not-available', (info: any) => {
      log.info('Update not available:', info);
      this.mainWindow?.webContents.send('update-status', { type: 'not-available', info });
    });

    autoUpdater.on('error', (err: any) => {
      log.error('Error in auto-updater:', err);
      this.mainWindow?.webContents.send('update-status', { type: 'error', error: err.message });
    });

    autoUpdater.on('download-progress', (progressObj: any) => {
      let logMessage = `Download speed: ${progressObj.bytesPerSecond}`;
      logMessage += ` - Downloaded ${progressObj.percent}%`;
      logMessage += ` (${progressObj.transferred}/${progressObj.total})`;
      log.info(logMessage);
      this.mainWindow?.webContents.send('update-status', { type: 'progress', progress: progressObj });
    });

    autoUpdater.on('update-downloaded', (info: any) => {
      log.info('Update downloaded:', info);
      this.mainWindow?.webContents.send('update-status', { type: 'downloaded', info });
      // Optionally, prompt user to restart
       dialog.showMessageBox(this.mainWindow!, {
         type: 'info',
         title: 'Update Ready',
         message: 'A new version has been downloaded. Restart the application to apply the updates.',
         buttons: ['Restart', 'Later']
       }).then((buttonIndex) => {
         if (buttonIndex.response === 0) { // Restart button
           autoUpdater.quitAndInstall();
         }
       });
    });
  }

  private setupDeepLinking(): void {
    // Set protocol client
    if (process.env.NODE_ENV === 'development') {
      // In development, we need to register with system properly
      const devArgs = [path.resolve(process.argv[1])];
      log.info('Registering protocol handler for development with args:', {
        execPath: process.execPath,
        args: devArgs
      });
      app.setAsDefaultProtocolClient('ekrown-classroom', process.execPath, devArgs);
    } else {
      app.setAsDefaultProtocolClient('ekrown-classroom');
    }
    
    // Log registration status
    const isRegistered = app.isDefaultProtocolClient('ekrown-classroom');
    log.info(`Protocol handler registration status: ${isRegistered}`);

    // Ensure single instance
    const gotTheLock = app.requestSingleInstanceLock();

    if (!gotTheLock) {
      app.quit();
    } else {
      app.on('second-instance', (event, commandLine) => {
        if (this.mainWindow) {
          if (this.mainWindow.isMinimized()) this.mainWindow.restore();
          this.mainWindow.focus();

          // Find protocol URL in command line arguments
          const protocolUrl = commandLine.find(arg => arg.startsWith('ekrown-classroom://'));
          if (protocolUrl) {
            log.info(`Second instance received protocol URL: ${protocolUrl}`);
            this.handleAuthCallback(protocolUrl);
          }
        }
      });
    }

    // Handle protocol on macOS
    app.on('open-url', (event, url) => {
      event.preventDefault();
      log.info(`Open URL event received: ${url}`);
      this.handleAuthCallback(url);
    });

    // Handle protocol URL on app start (for cases where app isn't running)
    if (process.argv.length > 1) {
      const protocolUrl = process.argv.find(arg => arg.startsWith('ekrown-classroom://'));
      if (protocolUrl) {
        log.info(`App started with protocol URL: ${protocolUrl}`);
        // Delay handling until app is ready and window is created
        setTimeout(() => {
          this.handleAuthCallback(protocolUrl);
        }, 2000);
      }
    }
  }

  private async handleAuthCallback(url: string): Promise<void> {
    log.info(`Handling auth callback URL: ${url}`);
    
    try {
      // Handle different callback URL formats - Updated to match Supabase redirect URL configuration
      if (url.includes('auth/callback') || url.includes('auth-success') || url.includes('confirm') || url.includes('access_token')) {
        if (!this.supabaseService) {
          log.error('Supabase service not initialized for auth callback');
          return;
        }
        
        // Process the auth callback through Supabase service
        const result = await this.supabaseService.handleAuthCallback(url);
        
        if (result.success && result.user) {
          log.info('Auth callback successful, user authenticated:', result.user.email);
          
          if (this.mainWindow) {
            // Bring window to front
            if (this.mainWindow.isMinimized()) {
              this.mainWindow.restore();
            }
            this.mainWindow.focus();
            this.mainWindow.show();
            
            // Notify renderer that authentication was successful
            this.mainWindow.webContents.send('auth-success', result.user);
            
            // Also trigger a re-check of auth status
            this.mainWindow.webContents.send('re-check-auth-status');
            
            // Show success notification
            dialog.showMessageBox(this.mainWindow, {
              type: 'info',
              title: 'Authentication Successful',
              message: 'Email confirmed successfully!',
              detail: `Welcome back, ${result.user.email}! You can now use the eKROWN Classroom AI Assistant.`,
              buttons: ['OK']
            });
          }
        } else {
          const errorMessage = this.formatErrorMessage(result.error);
          log.error('Auth callback failed:', errorMessage);
          
          if (this.mainWindow) {
            // Bring window to front for error display
            if (this.mainWindow.isMinimized()) {
              this.mainWindow.restore();
            }
            this.mainWindow.focus();
            this.mainWindow.show();
            
            // Send formatted error to renderer
            this.mainWindow.webContents.send('auth-error', errorMessage);
            
            // Show error dialog with formatted message
            dialog.showErrorBox(
              'Authentication Failed',
              errorMessage || 'Authentication failed. Please try signing in again.'
            );
          }
        }
      } else {
        log.warn('Unknown protocol URL format:', url);
        if (this.mainWindow) {
          this.mainWindow.webContents.send('auth-error', 'Unknown authentication URL format');
        }
      }
    } catch (error) {
      const errorMessage = this.formatErrorMessage(error);
      log.error('Exception handling auth callback:', errorMessage);
      
      if (this.mainWindow) {
        this.mainWindow.webContents.send('auth-error', errorMessage);
        
        dialog.showErrorBox(
          'Authentication Error',
          `Failed to process authentication: ${errorMessage}`
        );
      }
    }
  }

  // Helper method to properly format error messages
  private formatErrorMessage(error: any): string {
    if (typeof error === 'string') {
      return error;
    }
    
    if (error && typeof error === 'object') {
      if (error.message && typeof error.message === 'string') {
        return error.message;
      }
      
      if (error.error && typeof error.error === 'string') {
        return error.error;
      }
      
      // Try to extract meaningful error information
      try {
        const errorStr = JSON.stringify(error, null, 2);
        if (errorStr !== '{}') {
          return errorStr;
        }
      } catch (jsonError) {
        // JSON.stringify failed, fall back to toString
      }
      
      return error.toString();
    }
    
    return 'Unknown error occurred';
  }

  // Handle Stripe checkout session completed webhook
  private async handleCheckoutSessionCompleted(event: any): Promise<void> {
    try {
      const session = event.data.object;
      const customerId = session.customer;
      const subscriptionId = session.subscription;
      const clientReferenceId = session.client_reference_id; // This is the Supabase user ID
      
      log.info('Processing checkout session completed:', {
        sessionId: session.id,
        customerId,
        subscriptionId,
        clientReferenceId
      });

      if (clientReferenceId && subscriptionId && this.supabaseService) {
        // Update license status in Supabase
        const updateResult = await this.supabaseService.updateLicenseFromStripe(
          subscriptionId,
          'active',
          clientReferenceId,
          customerId
        );
        
        if (updateResult.success) {
          log.info('Successfully updated license after checkout completion');
          
          // Notify the renderer if window is available
          if (this.mainWindow) {
            this.mainWindow.webContents.send('payment-completed', {
              subscriptionId,
              customerId,
              userId: clientReferenceId
            });
          }
        } else {
          log.error('Failed to update license after checkout:', updateResult.error);
        }
      }
    } catch (error) {
      log.error('Error handling checkout session completed:', error);
    }
  }

  // Handle Stripe subscription updated webhook
  private async handleSubscriptionUpdated(event: any): Promise<void> {
    try {
      const subscription = event.data.object;
      const subscriptionId = subscription.id;
      const status = subscription.status;
      
      log.info('Processing subscription updated:', {
        subscriptionId,
        status
      });

      if (this.supabaseService) {
        // Update license status in Supabase
        const updateResult = await this.supabaseService.updateLicenseFromStripe(
          subscriptionId,
          status
        );
        
        if (updateResult.success) {
          log.info('Successfully updated license after subscription change');
        } else {
          log.error('Failed to update license after subscription change:', updateResult.error);
        }
      }
    } catch (error) {
      log.error('Error handling subscription updated:', error);
    }
  }

  // This HTTP server is separate from the one in src/index.ts (your main backend)
  // It's for Electron app-specific HTTP endpoints if needed (e.g., OAuth callbacks directly to the app)
  private startHttpServer(): void {
    const port = process.env.ELECTRON_APP_HTTP_PORT || 3002; // Use a different port
    const expressApp = express();

    log.info(`[Electron HTTP Server] Attempting to start on port ${port}`);
    
    // Add JSON middleware
    expressApp.use(express.json());
    
    // Example: OAuth callback endpoint
    expressApp.get('/auth/google/callback', (req, res) => {
        log.info(`[Electron HTTP Server] Received GET /auth/google/callback with query:`, req.query);
        // Send data to renderer process
        this.mainWindow?.webContents.send('oauth-callback', { provider: 'google', query: req.query });
        res.send('Authentication successful! You can close this tab.');
    });

    expressApp.get('/', (req, res) => {
      log.info('[Electron HTTP Server] Received GET /');
      res.send(`Electron App HTTP Server is running. App version: ${app.getVersion()}`);
    });

    expressApp.listen(port, () => {
      log.info(`[Electron HTTP Server] Listening on port ${port}`);
      console.log(`[Electron HTTP Server] Listening on http://localhost:${port}`);
    }).on('error', (err: NodeJS.ErrnoException) => {
      log.error('[Electron HTTP Server] Failed to start:', err);
      console.error('[Electron HTTP Server] Error starting server:', err.message);
      if (err.code === 'EADDRINUSE') {
        log.error(`[Electron HTTP Server] Port ${port} is already in use.`);
        // Don't show a dialog that blocks app start for this optional server
      }
    });
  }
}

// Initialize the application
new GoogleClassroomMCPApp();
