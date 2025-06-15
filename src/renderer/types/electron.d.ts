export interface ElectronAPI {
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
  };

  // Stripe billing
  stripe: {
    createCheckoutSession: (priceId: string) => Promise<any>;
    getSubscriptionStatus: () => Promise<any>;
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
}