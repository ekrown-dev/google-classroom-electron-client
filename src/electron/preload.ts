// Debug logging at the start
console.log('=== PRELOAD SCRIPT STARTING ===');

try {
  const { contextBridge, ipcRenderer } = require('electron');
  console.log('Electron modules loaded successfully');

  // Define the API interface
  interface ElectronAPI {
    // Supabase Auth & Licensing
    supabase: {
      signIn: (email: string, password: string) => Promise<any>;
      signUp: (email: string, password: string, metadata: {
        firstName: string;
        lastName: string;
        organization?: string;
      }) => Promise<any>;
      signOut: () => Promise<any>;
      getCurrentUser: () => Promise<any>;
      getLicenseStatus: () => Promise<any>;
      getUserMetadata: () => Promise<any>;
      updateSetupCompletion: (completed: boolean) => Promise<any>;
      getSetupCompletion: () => Promise<any>;
      refreshSession: () => Promise<any>;
      isAuthenticated: () => Promise<any>;
    };

    // Stripe billing
    stripe: {
      createCheckoutSession: (priceId: string, userId: string) => Promise<any>;
      getSubscriptionStatus: () => Promise<any>;
      getAvailablePlans: () => Promise<any>;
    };

    // Subscription management
    subscription: {
      checkAfterPayment: () => Promise<any>;
    };

    // Claude detection
    claude: {
      detect: () => Promise<any>;
      validate: () => Promise<any>;
      getInstallInstructions: () => Promise<any>;
    };

    // Credential management
    credentials: {
      save: (credentials: any) => Promise<any>;
      load: () => Promise<any>;
      validate: (credentials: any) => Promise<any>;
      clear: () => Promise<any>;
    };

    // MCP launcher
    mcp: {
      launch: () => Promise<any>;
      stop: () => Promise<any>;
      getStatus: () => Promise<any>;
      getLogs: () => Promise<any>;
    };

    // System utilities
    system: {
      getSystemInfo: () => Promise<any>;
      openExternal: (url: string) => Promise<any>;
      showItemInFolder: (path: string) => Promise<any>;
      exportLogs: () => Promise<any>;
    };

    // App management
    app: {
      getVersion: () => Promise<string>;
      quit: () => Promise<void>;
      restart: () => Promise<void>;
      checkForUpdates: () => Promise<any>;
    };

    // Event listeners
    on: (channel: string, callback: (...args: any[]) => void) => void;
    off: (channel: string, callback: (...args: any[]) => void) => void;
    removeListener: (channel: string, callback: (...args: any[]) => void) => void;
  }

  console.log('TypeScript interfaces defined');

  // Expose protected methods that allow the renderer process to use
  // the ipcRenderer without exposing the entire object
  const electronAPI: ElectronAPI = {
    supabase: {
      signIn: (email: string, password: string) => ipcRenderer.invoke('supabase:signIn', email, password),
      signUp: (email: string, password: string, metadata: {
        firstName: string;
        lastName: string;
        organization?: string;
      }) => ipcRenderer.invoke('supabase:signUp', email, password, metadata),
      signOut: () => ipcRenderer.invoke('supabase:signOut'),
      getCurrentUser: () => ipcRenderer.invoke('supabase:getCurrentUser'),
      getLicenseStatus: () => ipcRenderer.invoke('supabase:getLicenseStatus'),
      getUserMetadata: () => ipcRenderer.invoke('supabase:getUserMetadata'),
      updateSetupCompletion: (completed: boolean) => ipcRenderer.invoke('supabase:updateSetupCompletion', completed),
      getSetupCompletion: () => ipcRenderer.invoke('supabase:getSetupCompletion'),
      refreshSession: () => ipcRenderer.invoke('supabase:refreshSession'),
      isAuthenticated: () => ipcRenderer.invoke('supabase:isAuthenticated')
    },

    stripe: {
      createCheckoutSession: (priceId: string, userId: string) => 
        ipcRenderer.invoke('stripe:createCheckoutSession', priceId, userId),
      getSubscriptionStatus: () => ipcRenderer.invoke('stripe:getSubscriptionStatus'),
      getAvailablePlans: () => ipcRenderer.invoke('stripe:getAvailablePlans')
    },

    subscription: {
      checkAfterPayment: () => ipcRenderer.invoke('subscription:checkAfterPayment')
    },

    claude: {
      detect: () => ipcRenderer.invoke('claude:detect'),
      validate: () => ipcRenderer.invoke('claude:validate'),
      getInstallInstructions: () => ipcRenderer.invoke('claude:getInstallInstructions')
    },

    credentials: {
      save: (credentials: any) => ipcRenderer.invoke('credentials:save', credentials),
      load: () => ipcRenderer.invoke('credentials:load'),
      validate: (credentials: any) => ipcRenderer.invoke('credentials:validate', credentials),
      clear: () => ipcRenderer.invoke('credentials:clear')
    },

    mcp: {
      launch: () => ipcRenderer.invoke('mcp:launch'),
      stop: () => ipcRenderer.invoke('mcp:stop'),
      getStatus: () => ipcRenderer.invoke('mcp:getStatus'),
      getLogs: () => ipcRenderer.invoke('mcp:getLogs')
    },

    system: {
      getSystemInfo: () => ipcRenderer.invoke('system:getSystemInfo'),
      openExternal: (url: string) => ipcRenderer.invoke('system:openExternal', url),
      showItemInFolder: (path: string) => ipcRenderer.invoke('system:showItemInFolder', path),
      exportLogs: () => ipcRenderer.invoke('system:exportLogs')
    },

    app: {
      getVersion: () => ipcRenderer.invoke('app:getVersion'),
      quit: () => ipcRenderer.invoke('app:quit'),
      restart: () => ipcRenderer.invoke('app:restart'),
      checkForUpdates: () => ipcRenderer.invoke('app:checkForUpdates')
    },

    on: (channel: string, callback: (...args: any[]) => void) => {
      const validChannels = [
        'update-status',
        'navigate-to-settings',
        'show-about-dialog',
        'mcp-status-change',
        'license-status-change',
        're-check-auth-status',
        'auth-success',
        'auth-error'
      ];
      
      if (validChannels.includes(channel)) {
        ipcRenderer.on(channel, callback);
      }
    },

    off: (channel: string, callback: (...args: any[]) => void) => {
      ipcRenderer.removeListener(channel, callback);
    },

    removeListener: (channel: string, callback: (...args: any[]) => void) => {
      ipcRenderer.removeListener(channel, callback);
    }
  };

  console.log('electronAPI object created');

  // Expose the API to the renderer process
  contextBridge.exposeInMainWorld('electronAPI', electronAPI);
  console.log('electronAPI exposed to window object via contextBridge');

  // Verify the exposure worked
  console.log('contextBridge available:', typeof contextBridge);
  console.log('Preload script executed successfully');

  // Add a global verification function
  (global as any).__PRELOAD_VERIFICATION__ = true;
  console.log('Global verification flag set');

} catch (error) {
  console.error('PRELOAD SCRIPT ERROR:', error);
  console.error('Error details:', {
    message: error instanceof Error ? error.message : 'Unknown error',
    stack: error instanceof Error ? error.stack : 'No stack trace'
  });
}

console.log('=== PRELOAD SCRIPT ENDING ==='); 