import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';
import log from 'electron-log';

interface UserLicense {
  id: string;
  user_id: string;
  license_type: 'basic' | 'premium' | 'enterprise';
  status: 'active' | 'expired' | 'suspended' | 'trial';
  expires_at: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
  updated_at: string;
}

interface UserMetadata {
  role: 'admin' | 'teacher' | 'viewer';
  organization_id?: string;
  organization_name?: string;
  license?: UserLicense;
  setup_completed?: boolean;
  setup_completed_at?: string;
}

export class SupabaseService {
  private client: SupabaseClient;
  private currentUser: User | null = null;
  private currentSession: Session | null = null;
  private authInitialized: boolean = false;
  private authInitPromise: Promise<void> | null = null;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    log.info('Environment variables check:', {
      hasSupabaseUrl: !!supabaseUrl,
      hasSupabaseAnonKey: !!supabaseAnonKey,
      supabaseUrl: supabaseUrl ? `${supabaseUrl.substring(0, 20)}...` : 'undefined',
      nodeEnv: process.env.NODE_ENV
    });

    if (!supabaseUrl || !supabaseAnonKey) {
      const error = 'Missing Supabase configuration. Please set SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_ANON_KEY/VITE_SUPABASE_ANON_KEY environment variables.';
      log.error(error);
      throw new Error(error);
    }

    log.info('Initializing Supabase client with URL:', supabaseUrl);

    try {
      this.client = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          autoRefreshToken: true,
          persistSession: false,
          detectSessionInUrl: false,
          storage: {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          }
        }
      });
      this.authInitPromise = this.initializeAuth();
      log.info('Supabase service initialized successfully');
    } catch (error) {
      log.error('Error creating Supabase client:', error);
      throw error;
    }
  }

  private async initializeAuth(): Promise<void> {
    try {
      log.info('Initializing authentication...');
      
      // Start with clean state - no session recovery for desktop app
      this.currentSession = null;
      this.currentUser = null;

      // Listen for auth changes
      this.client.auth.onAuthStateChange(async (event, session) => {
        log.info('Auth state changed:', event, session ? 'with session' : 'without session');
        
        this.currentSession = session;
        this.currentUser = session?.user || null;
        
        if (event === 'SIGNED_IN' && session?.user) {
          log.info('User signed in via auth state change:', session.user.email);
        } else if (event === 'SIGNED_OUT') {
          log.info('User signed out via auth state change');
          this.currentSession = null;
          this.currentUser = null;
        }
      });
      
      log.info('Authentication initialization completed - clean state, ready for manual sign-in');
    } catch (error) {
      log.error('Critical error during auth initialization:', error);
      this.currentSession = null;
      this.currentUser = null;
    } finally {
      this.authInitialized = true;
    }
  }

  private async ensureAuthInitialized(): Promise<void> {
    if (this.authInitialized) {
      return;
    }
    
    if (this.authInitPromise) {
      await this.authInitPromise;
    } else {
      // If for some reason there's no promise, initialize now
      await this.initializeAuth();
    }
  }

  async signIn(email: string, password: string): Promise<{ success: boolean; user?: User; error?: string }> {
    try {
      await this.ensureAuthInitialized();
      
      log.info('Attempting sign in for email:', email);
      
      const { data, error } = await this.client.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        log.error('Sign in error:', error);
        
        // Provide more specific error messages
        if (error.message?.includes('Email not confirmed')) {
          return { 
            success: false, 
            error: 'Please check your email and click the confirmation link before signing in. Check your spam folder if you don\'t see the email.' 
          };
        } else if (error.message?.includes('Invalid login credentials')) {
          return { 
            success: false, 
            error: 'Invalid email or password. Please check your credentials and try again.' 
          };
        }
        
        return { success: false, error: error.message };
      }

      if (data.user && data.session) {
        this.currentUser = data.user;
        this.currentSession = data.session;
        log.info('User signed in successfully:', data.user.email);
        
        // Verify the user email is confirmed
        if (!data.user.email_confirmed_at) {
          log.warn('User email not confirmed, but sign in succeeded');
          await this.signOut();
          return { 
            success: false, 
            error: 'Please check your email and click the confirmation link before signing in.' 
          };
        }
        
        return { success: true, user: data.user };
      }

      return { success: false, error: 'No user or session returned from sign in' };
    } catch (error: any) {
      log.error('Sign in exception:', error);
      return { success: false, error: error.message };
    }
  }

  async signOut(): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await this.client.auth.signOut();
      
      if (error) {
        log.error('Sign out error:', error);
        return { success: false, error: error.message };
      }

      this.currentUser = null;
      this.currentSession = null;
      log.info('User signed out successfully');
      
      return { success: true };
    } catch (error: any) {
      log.error('Sign out exception:', error);
      return { success: false, error: error.message };
    }
  }

  async signUp(email: string, password: string, metadata: {
    firstName: string;
    lastName: string;
    organization?: string;
  }): Promise<{ success: boolean; user?: User; error?: string }> {
    try {
      const { data, error } = await this.client.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: metadata.firstName,
            last_name: metadata.lastName,
            organization: metadata.organization || ''
          }
        }
      });

      if (error) {
        log.error('Sign up error:', error);
        return { success: false, error: error.message };
      }

      if (data.user) {
        this.currentUser = data.user;
        this.currentSession = data.session;
        log.info('User signed up successfully:', data.user.email);
        
        // The trial license and user profile are now created by a server-side trigger.
        // The old client-side call has been removed.

        return { success: true, user: data.user };
      }

      return { success: false, error: 'No user returned from sign up' };
    } catch (error: any) {
      log.error('Sign up exception:', error);
      return { success: false, error: error.message };
    }
  }

  async getCurrentUser(): Promise<{ success: boolean; user?: User; error?: string }> {
    try {
      await this.ensureAuthInitialized();
      
      if (this.currentUser && this.currentSession) {
        return { success: true, user: this.currentUser };
      }

      return { success: false, error: 'No authenticated user session' };
    } catch (error: any) {
      log.error('Get current user exception:', error);
      return { success: false, error: error.message };
    }
  }

  async handleAuthCallback(url: string): Promise<{ success: boolean; user?: User; error?: string }> {
    try {
      log.info('Processing auth callback URL in SupabaseService:', url);
      
      // Handle different URL formats from various authentication flows
      let params: URLSearchParams;
      
      // First, check if this is a simple success callback without tokens
      // This happens when using email confirmation links that redirect to deep links
      if (url === 'ekrown-classroom://auth-success' || url === 'ekrown-classroom://auth/callback') {
        log.info('Received simple success callback, checking current session');
        
        // Try to get the current session from Supabase
        const { data: { session }, error } = await this.client.auth.getSession();
        
        if (error) {
          log.error('Error getting session after callback:', error);
          return { success: false, error: `Session retrieval failed: ${error.message}` };
        }
        
        if (session && session.user) {
          this.currentSession = session;
          this.currentUser = session.user;
          log.info('Successfully retrieved existing session for user:', session.user.email);
          return { success: true, user: session.user };
        } else {
          log.warn('No active session found after success callback');
          return { success: false, error: 'No active session found. Please sign in again.' };
        }
      }
      
      // Handle protocol URLs by converting them to standard URLs for parsing
      let urlToParse = url;
      if (url.startsWith('ekrown-classroom://')) {
        // Convert protocol URL to standard URL for easier parsing
        urlToParse = url.replace('ekrown-classroom://', 'https://dummy.com/');
      }
      
      try {
        const urlObj = new URL(urlToParse);
        
        // Check if tokens are in hash fragment (standard OAuth flow)
        if (urlObj.hash && urlObj.hash.length > 1) {
          const fragment = urlObj.hash.substring(1); // Remove #
          params = new URLSearchParams(fragment);
          log.info('Parsing tokens from URL hash:', fragment);
        } 
        // Check if tokens are in query parameters (some flows)
        else if (urlObj.search) {
          params = new URLSearchParams(urlObj.search);
          log.info('Parsing tokens from URL query:', urlObj.search);
        } 
        // If no hash or query, might be a simple success callback
        else {
          log.info('No tokens found in URL, checking current session');
          // Try to get current session as fallback
          const { data: { session }, error } = await this.client.auth.getSession();
          if (session && session.user) {
            this.currentSession = session;
            this.currentUser = session.user;
            return { success: true, user: session.user };
          }
          return { success: false, error: 'No authentication tokens found in callback URL and no active session' };
        }
      } catch (urlError) {
        // If URL parsing fails, try to extract hash directly from the original URL
        log.warn('URL parsing failed, trying direct hash extraction:', urlError);
        const hashIndex = url.indexOf('#');
        if (hashIndex !== -1) {
          const fragment = url.substring(hashIndex + 1);
          params = new URLSearchParams(fragment);
          log.info('Parsing tokens from direct hash extraction:', fragment);
        } else {
          log.error('No hash found in URL and URL parsing failed:', url);
          // As final fallback, try to get current session
          const { data: { session }, error } = await this.client.auth.getSession();
          if (session && session.user) {
            this.currentSession = session;
            this.currentUser = session.user;
            return { success: true, user: session.user };
          }
          return { success: false, error: 'Invalid callback URL format and no active session' };
        }
      }
      
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const tokenType = params.get('token_type');
      const expiresIn = params.get('expires_in');
      const errorParam = params.get('error');
      const errorDescription = params.get('error_description');
      
      log.info('Extracted parameters:', {
        hasAccessToken: !!accessToken,
        hasRefreshToken: !!refreshToken,
        tokenType,
        expiresIn,
        error: errorParam,
        errorDescription
      });
      
      if (errorParam) {
        const error = errorDescription || errorParam;
        log.error('Authentication error in callback:', error);
        return { success: false, error };
      }
      
      if (!accessToken || !refreshToken) {
        const error = 'Missing authentication tokens in callback URL';
        log.error(error, { accessToken: !!accessToken, refreshToken: !!refreshToken });
        
        // Try to get current session as fallback
        const { data: { session }, error: sessionError } = await this.client.auth.getSession();
        if (session && session.user) {
          this.currentSession = session;
          this.currentUser = session.user;
          log.info('Found existing session despite missing tokens');
          return { success: true, user: session.user };
        }
        
        return { success: false, error };
      }
      
      // Set the session using the tokens
      const { data, error } = await this.client.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      });
      
      if (error) {
        log.error('Error setting session from tokens:', error);
        return { success: false, error: error.message };
      }
      
      if (data.session && data.user) {
        this.currentSession = data.session;
        this.currentUser = data.user;
        log.info('Successfully authenticated user from callback:', data.user.email);
        return { success: true, user: data.user };
      }
      
      return { success: false, error: 'No session or user returned from setSession' };
    } catch (error: any) {
      log.error('Auth callback handling exception:', error);
      return { success: false, error: error.message || 'Authentication callback processing failed' };
    }
  }

  async getLicenseStatus(): Promise<{ 
    success: boolean; 
    status?: 'active' | 'expired' | 'suspended' | 'trial' | 'none';
    license?: UserLicense;
    daysRemaining?: number;
    error?: string;
  }> {
    try {
      await this.ensureAuthInitialized();
      
      if (!this.currentUser) {
        return { success: false, error: 'User not authenticated' };
      }

      const { data: license, error } = await this.client
        .from('user_licenses')
        .select('*')
        .eq('user_id', this.currentUser.id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') { // No rows returned
          return { success: true, status: 'none' };
        }
        log.error('License status error:', error);
        return { success: false, error: error.message };
      }

      if (!license) {
        return { success: true, status: 'none' };
      }

      // Check if license is expired
      const now = new Date();
      const expiresAt = license.expires_at ? new Date(license.expires_at) : null;
      
      let status = license.status;
      let daysRemaining: number | undefined;

      if (expiresAt) {
        daysRemaining = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        
        if (now > expiresAt && status === 'active') {
          status = 'expired';
          
          // Update status in database
          await this.client
            .from('user_licenses')
            .update({ status: 'expired', updated_at: new Date().toISOString() })
            .eq('id', license.id);
        }
      }

      return { 
        success: true, 
        status, 
        license,
        daysRemaining: daysRemaining && daysRemaining > 0 ? daysRemaining : undefined
      };
    } catch (error: any) {
      log.error('Get license status exception:', error);
      return { success: false, error: error.message };
    }
  }

  async getUserMetadata(): Promise<{ success: boolean; metadata?: UserMetadata; error?: string }> {
    try {
      await this.ensureAuthInitialized();
      
      if (!this.currentUser) {
        return { success: false, error: 'User not authenticated' };
      }

      // Get user profile data with correct column name (id instead of user_id)
      let profile: any = null;
      let profileError: any = null;

      // Query using 'id' column (not 'user_id')
      try {
        const result = await this.client
          .from('user_profiles')
          .select(`
            role,
            organization_id,
            setup_completed,
            setup_completed_at,
            organizations (
              name
            )
          `)
          .eq('id', this.currentUser.id)
          .single();
        
        profile = result.data;
        profileError = result.error;
      } catch (error: any) {
        log.error('Profile query error:', error);
        profileError = error;
      }

      if (profileError && profileError.code !== 'PGRST116') {
        log.error('User profile error:', profileError);
        return { success: false, error: profileError.message };
      }

      // Get license information
      const licenseResult = await this.getLicenseStatus();
      
      const metadata: UserMetadata = {
        role: profile?.role || 'teacher',
        organization_id: profile?.organization_id,
        organization_name: (profile?.organizations as any)?.name,
        license: licenseResult.license,
        setup_completed: profile?.setup_completed || false,
        setup_completed_at: profile?.setup_completed_at
      };

      return { success: true, metadata };
    } catch (error: any) {
      log.error('Get user metadata exception:', error);
      return { success: false, error: error.message };
    }
  }

  async updateLicenseFromStripe(stripeSubscriptionId: string, status: string, userId?: string, stripeCustomerId?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const targetUserId = userId || this.currentUser?.id;
      
      if (!targetUserId) {
        return { success: false, error: 'User ID not provided and no authenticated user' };
      }

      // First check if license record exists
      const { data: existingLicense, error: fetchError } = await this.client
        .from('user_licenses')
        .select('*')
        .eq('user_id', targetUserId)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        log.error('Error fetching existing license:', fetchError);
        return { success: false, error: fetchError.message };
      }

      const updateData = {
        status,
        stripe_subscription_id: stripeSubscriptionId,
        stripe_customer_id: stripeCustomerId || existingLicense?.stripe_customer_id || null,
        updated_at: new Date().toISOString(),
        license_type: 'premium' as const,
        expires_at: null // Premium subscriptions don't expire until cancelled
      };

      let result;
      if (existingLicense) {
        // Update existing license
        result = await this.client
          .from('user_licenses')
          .update(updateData)
          .eq('user_id', targetUserId);
      } else {
        // Create new license record
        result = await this.client
          .from('user_licenses')
          .insert({
            ...updateData,
            user_id: targetUserId,
            created_at: new Date().toISOString()
          });
      }

      if (result.error) {
        log.error('Update/create license error:', result.error);
        return { success: false, error: result.error.message };
      }

      log.info('License updated from Stripe:', { stripeSubscriptionId, status, userId: targetUserId, customerId: stripeCustomerId });
      return { success: true };
    } catch (error: any) {
      log.error('Update license from Stripe exception:', error);
      return { success: false, error: error.message };
    }
  }

  // The createTrialLicense method has been removed as this is now handled
  // by a database trigger in Supabase for better security and reliability.

  subscribeToLicenseChanges(callback: (license: UserLicense | null) => void): () => void {
    if (!this.currentUser) {
      log.warn('Cannot subscribe to license changes, user not authenticated.');
      throw new Error('User not authenticated');
    }

    const subscription = this.client
      .channel('license-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_licenses',
          filter: `user_id=eq.${this.currentUser.id}`
        },
        (payload) => {
          log.info('License changed:', payload);
          callback(payload.new as UserLicense);
        }
      )
      .subscribe();

    // Return unsubscribe function
    return () => {
      this.client.removeChannel(subscription);
    };
  }

  isAuthenticated(): boolean {
    return this.currentUser !== null && this.currentSession !== null;
  }

  getAccessToken(): string | null {
    return this.currentSession?.access_token || null;
  }

  async refreshSession(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.ensureAuthInitialized();
      
      if (!this.currentSession?.refresh_token) {
        return { success: false, error: 'No refresh token available' };
      }

      const { data, error } = await this.client.auth.refreshSession({
        refresh_token: this.currentSession.refresh_token
      });

      if (error) {
        log.error('Session refresh error:', error);
        this.currentSession = null;
        this.currentUser = null;
        return { success: false, error: error.message };
      }

      if (data.session && data.user) {
        this.currentSession = data.session;
        this.currentUser = data.user;
        log.info('Session refreshed successfully for user:', data.user.email);
        return { success: true };
      }

      return { success: false, error: 'No session returned from refresh' };
    } catch (error: any) {
      log.error('Session refresh exception:', error);
      this.currentSession = null;
      this.currentUser = null;
      return { success: false, error: error.message };
    }
  }

  async updateSetupCompletion(completed: boolean): Promise<{ success: boolean; error?: string }> {
    try {
      await this.ensureAuthInitialized();
      
      if (!this.currentUser) {
        return { success: false, error: 'User not authenticated' };
      }

      const updateData = {
        setup_completed: completed,
        setup_completed_at: completed ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      };

      // First try to update existing profile using 'id' column
      const { data: existingProfile, error: selectError } = await this.client
        .from('user_profiles')
        .select('id')
        .eq('id', this.currentUser.id)
        .single();

      if (selectError && selectError.code !== 'PGRST116') {
        log.error('Profile select failed:', selectError);
        return { success: false, error: selectError.message };
      }

      if (existingProfile) {
        // Update existing profile
        const { error: updateError } = await this.client
          .from('user_profiles')
          .update(updateData)
          .eq('id', this.currentUser.id);

        if (updateError) {
          log.error('Profile update failed:', updateError);
          return { success: false, error: updateError.message };
        }
      } else {
        // Create new profile with setup completion
        const { error: insertError } = await this.client
          .from('user_profiles')
          .insert({
            id: this.currentUser.id,
            role: 'teacher',
            ...updateData,
            created_at: new Date().toISOString()
          });

        if (insertError) {
          log.error('Profile insert failed:', insertError);
          return { success: false, error: insertError.message };
        }
      }

      log.info(`Setup completion updated: ${completed} for user ${this.currentUser.id}`);
      return { success: true };
    } catch (error: any) {
      log.error('Update setup completion exception:', error);
      return { success: false, error: error.message };
    }
  }

  async getSetupCompletion(): Promise<{ success: boolean; completed?: boolean; error?: string }> {
    try {
      await this.ensureAuthInitialized();
      
      if (!this.currentUser) {
        return { success: false, error: 'User not authenticated' };
      }

      // Query using 'id' column (not 'user_id')
      try {
        const { data: profile, error: profileError } = await this.client
          .from('user_profiles')
          .select('setup_completed')
          .eq('id', this.currentUser.id)
          .single();

        if (profileError) {
          if (profileError.code === 'PGRST116') {
            // No profile found, setup not completed
            return { success: true, completed: false };
          }
          log.error('Get setup completion error:', profileError);
          return { success: false, error: profileError.message };
        }

        return { 
          success: true, 
          completed: profile?.setup_completed || false 
        };
      } catch (dbError) {
        log.error('Database query failed:', dbError);
        return { success: false, error: 'Database query failed' };
      }
    } catch (error: any) {
      log.error('Get setup completion exception:', error);
      return { success: false, error: error.message };
    }
  }
} 