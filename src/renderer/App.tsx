import React, { useState, useEffect } from 'react';
import { 
  ThemeProvider, 
  createTheme, 
  CssBaseline,
  Box,
  Typography,
  Alert,
  Button
} from '@mui/material';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ClaudeStatusProvider, useClaudeStatus } from './contexts/ClaudeStatusContext';
import { SetupStorage } from './utils/setupStorage';
import ekrnLogo from './assets/eKRN-logo.png';

// Import components we'll create
import LoginScreen from './components/LoginScreen';
import Dashboard from './components/Dashboard';
import SetupWizard from './components/SetupWizard';
import Settings from './components/Settings';
import Navigation from './components/Navigation';

// Define theme
const theme = createTheme({
  palette: {
    primary: {
      main: '#4285f4', // Google Blue
    },
    secondary: {
      main: '#34a853', // Google Green
    },
    background: {
      default: '#f5f5f5',
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h4: {
      fontWeight: 600,
    },
    h5: {
      fontWeight: 500,
    },
  },
});

interface AppState {
  isLoading: boolean;
  isAuthenticated: boolean;
  isSetupComplete: boolean;
  user: any;
  license: any;
  error: string | null;
  isGoogleConnected: boolean;
  isClaudeReady: boolean;
}

const AppInitializer: React.FC<{ children: React.ReactNode; isAuthenticated: boolean }> = ({ children, isAuthenticated }) => {
  // Removed automatic Claude detection - should only happen during Setup Wizard
  return <>{children}</>;
};

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    isLoading: true,
    isAuthenticated: false,
    isSetupComplete: false,
    user: null,
    license: null,
    error: null,
    isGoogleConnected: false,
    isClaudeReady: false
  });

  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    initializeApp();

    const handleFocus = () => {
      // Only refresh data if the user is logged in and has completed setup.
      // This prevents the wizard or login screen from being disrupted.
      if (state.isAuthenticated && state.isSetupComplete) {
        console.log('App focused, refreshing user/license state.');
        // We can call a more lightweight refresh function here if needed,
        // but re-initializing is acceptable for now if it's guarded.
        initializeApp();
      } else {
        console.log('App focused, but skipping refresh because user is in login/setup.');
      }
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [retryCount, state.isAuthenticated, state.isSetupComplete]);

  useEffect(() => {
    const handleAuthCallback = () => {
      console.log('Received auth callback from main process. Re-checking auth status.');
      initializeApp();
    };

    const handleAuthSuccess = (user: any) => {
      console.log('Received auth success from main process:', user);
      setState(prev => ({
        ...prev,
        isAuthenticated: true,
        user,
        error: null,
        isSetupComplete: false,
        isGoogleConnected: false,
        isClaudeReady: false
      }));
      initializeApp(); // Re-initialize to fetch license and check other statuses
    };

    const handleAuthError = (error: string) => {
      console.error('Received auth error from main process:', error);
      setState(prev => ({
        ...prev,
        error: `Authentication failed: ${error}`,
        isAuthenticated: false,
        user: null
      }));
    };

    window.electronAPI.on('re-check-auth-status', handleAuthCallback);
    window.electronAPI.on('auth-success', handleAuthSuccess);
    window.electronAPI.on('auth-error', handleAuthError);

    return () => {
      window.electronAPI.removeListener('re-check-auth-status', handleAuthCallback);
      window.electronAPI.removeListener('auth-success', handleAuthSuccess);
      window.electronAPI.removeListener('auth-error', handleAuthError);
    };
  }, []);

  const waitForElectronAPI = async (maxAttempts = 20, delay = 200): Promise<boolean> => {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (window.electronAPI && window.electronAPI.supabase && typeof window.electronAPI.supabase.getCurrentUser === 'function') {
        console.log(`Electron API fully available after ${attempt + 1} attempts`);
        console.log('Available methods:', Object.keys(window.electronAPI.supabase));
        return true;
      }
      console.log(`Waiting for Electron API (attempt ${attempt + 1}/${maxAttempts})...`);
      console.log('Current API state:', {
        electronAPI: !!window.electronAPI,
        supabase: !!(window.electronAPI && window.electronAPI.supabase),
        getCurrentUser: !!(window.electronAPI && window.electronAPI.supabase && window.electronAPI.supabase.getCurrentUser)
      });
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    return false;
  };

  const initializeApp = async () => {
    try {
      // Reset loading and error state, but preserve setup completion status
      setState(prev => ({
        ...prev,
        error: null,
        isLoading: true,
        // CRITICAL: Do NOT reset isSetupComplete, isGoogleConnected, isClaudeReady
        // These should only be reset on logout or explicit state changes
        // Preserving setup state prevents status corruption during navigation
      }));

      console.log('App initialization starting...');
      const apiAvailable = await waitForElectronAPI();
      if (!apiAvailable) {
        throw new Error('Electron API not available after waiting. This usually means the preload script failed to load.');
      }
      console.log('Electron API confirmed available');

      // Try to get current user with session recovery
      let userResponse = await window.electronAPI.supabase.getCurrentUser();
      
      // If authentication fails, try to refresh session
      if (userResponse && !userResponse.success && userResponse.error?.includes('Auth session missing')) {
        console.log('Auth session missing, attempting session refresh...');
        try {
          const refreshResult = await window.electronAPI.supabase.refreshSession();
          if (refreshResult.success) {
            console.log('Session refresh successful, retrying user fetch...');
            userResponse = await window.electronAPI.supabase.getCurrentUser();
          } else {
            console.warn('Session refresh failed:', refreshResult.error);
          }
        } catch (refreshError) {
          console.warn('Session refresh threw exception:', refreshError);
        }
      }
      
      // IMPORTANT: Check userResponse.success and userResponse.user
      if (userResponse && userResponse.success && userResponse.user) {
        setState(prev => ({
          ...prev,
          isAuthenticated: true,
          user: userResponse.user // Correctly assign the user object
        }));

        // Fetch license ONLY if authenticated
        const licenseResponse = await window.electronAPI.supabase.getLicenseStatus();
        let licenseData = null;
        if (licenseResponse && licenseResponse.success && licenseResponse.license) {
          licenseData = {
            status: licenseResponse.status || licenseResponse.license.status,
            license_type: licenseResponse.license.license_type,
            expires_at: licenseResponse.license.expires_at,
            plan_name: licenseResponse.license.license_type, // Prefer license_type if status is just 'active'
            trial_ends_at: licenseResponse.license.expires_at, // Assuming expires_at is trial_ends_at for trials
            daysRemaining: licenseResponse.daysRemaining
          };
        } else if (licenseResponse && licenseResponse.success && licenseResponse.status) { // e.g. "no_license"
          licenseData = {
            status: licenseResponse.status, // e.g., "no_license", "trial_expired"
            license_type: null,
            expires_at: null,
            plan_name: null,
            trial_ends_at: null,
            daysRemaining: null
          };
        }
        setState(prev => ({ ...prev, license: licenseData }));

        // CRITICAL: Do NOT reset isGoogleConnected and isClaudeReady here
        // These states should persist across app initialization to prevent status corruption
        // Only reset these states on logout or explicit user actions
        
        // Check persistent setup completion status with fallback storage
        let setupComplete = false;
        try {
          const setupResult = await SetupStorage.getSetupCompletionWithFallback(
            userResponse.user.id,
            () => window.electronAPI.supabase.getSetupCompletion()
          );
          console.log('Setup completion result (with fallback):', setupResult);
          if (setupResult.success) {
            setupComplete = setupResult.completed === true;
            setState(prev => ({ 
              ...prev, 
              isSetupComplete: setupComplete
            }));
            console.log('Setup completion status loaded:', setupComplete);
            console.log('User will be routed to:', setupComplete ? 'Dashboard' : 'Setup Wizard');
          } else {
            console.warn('Could not load setup completion status:', setupResult.error);
            // For existing users with license data, assume setup is complete
            if (licenseData && (licenseData.status === 'active' || licenseData.status === 'trial')) {
              console.log('User has active license, assuming setup is complete');
              setupComplete = true;
              setState(prev => ({ ...prev, isSetupComplete: true }));
              
              // Save the completion status to prevent future issues
              try {
                await SetupStorage.setSetupCompletionWithFallback(
                  userResponse.user.id,
                  true,
                  (completed) => window.electronAPI.supabase.updateSetupCompletion(completed)
                );
                console.log('Setup completion status saved for existing user with license');
              } catch (saveError) {
                console.warn('Could not save setup completion status:', saveError);
              }
            } else {
              // Default to false for safety
              setState(prev => ({ ...prev, isSetupComplete: false }));
            }
          }
        } catch (error) {
          console.error('Error loading setup completion status:', error);
          // For existing users with license data, assume setup is complete
          if (licenseData && (licenseData.status === 'active' || licenseData.status === 'trial')) {
            console.log('User has active license, assuming setup is complete due to error');
            setupComplete = true;
            setState(prev => ({ ...prev, isSetupComplete: true }));
          } else {
            // Default to false for safety
            setState(prev => ({ ...prev, isSetupComplete: false }));
          }
        }

      } else {
        // No valid user session, or an error occurred fetching the user
        if (userResponse && userResponse.error) {
          // Log the specific auth error, but don't set it as a blocking app error
          // as this is an expected state for a logged-out user.
          console.warn(`User session check: ${userResponse.error}`);
        }
        setState(prev => ({
          ...prev,
          isAuthenticated: false,
          user: null,
          license: null,
          isSetupComplete: false,
          error: null, // Ensure no unrelated error blocks LoginScreen
          // isLoading will be set to false in finally
        }));
      }
    } catch (error) {
      // Catch other critical initialization errors (e.g., API not available)
      console.error('Critical App initialization failed:', error);
      setState(prev => ({
        ...prev,
        isAuthenticated: false,
        user: null,
        license: null,
        isSetupComplete: false,
        error: error instanceof Error ? error.message : 'Critical unknown error during init'
      }));
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  };

  const handleRetry = () => {
    setRetryCount(prev => prev + 1);
  };

  const handleAuthSuccess = (user: any) => {
    setState(prev => ({
      ...prev,
      isAuthenticated: true,
      user,
      error: null,
      // Reset setup status on new auth, user needs to go through wizard or have status re-evaluated
      isSetupComplete: false,
      isGoogleConnected: false,
      isClaudeReady: false
    }));
    initializeApp(); // Re-initialize to fetch license and check other statuses
  };

  const handleLogout = async () => {
    try {
      // Clear setup completion from localStorage on logout
      if (state.user?.id) {
        SetupStorage.clearSetupCompleted(state.user.id);
      }
      
      await window.electronAPI.supabase.signOut();
      setState(prev => ({
        ...prev,
        isAuthenticated: false,
        user: null,
        license: null,
        isSetupComplete: false,
        isGoogleConnected: false, // Reset on logout
        isClaudeReady: false      // Reset on logout
      }));
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const handleSetupComplete = async () => {
    if (!state.user?.id) {
      console.error('Cannot save setup completion: user ID not available');
      return;
    }

    try {
      console.log('Setup completion triggered...');
      // Update setup completion with fallback storage
      const result = await SetupStorage.setSetupCompletionWithFallback(
        state.user.id,
        true,
        (completed) => window.electronAPI.supabase.updateSetupCompletion(completed)
      );
      console.log('Setup completion save result (with fallback):', result);
      
      // Always update state regardless of database success (fallback ensures persistence)
      setState(prev => ({
        ...prev,
        isSetupComplete: true,
        // Assume by this point, Google and Claude have been set up if wizard is complete
        // These should ideally be set by the wizard steps themselves for better accuracy
        isGoogleConnected: true, 
        isClaudeReady: true
      }));
      console.log('Setup completion saved and state updated');
      console.log('App should now route to Dashboard on next navigation');
    } catch (error) {
      console.error('Error saving setup completion:', error);
      // Set state anyway to unblock the user - localStorage fallback should have worked
      setState(prev => ({
        ...prev,
        isSetupComplete: true,
        isGoogleConnected: true, 
        isClaudeReady: true
      }));
      console.log('Setup completion state updated despite exception');
    }
  };

  const handleGoogleConnected = () => {
    setState(prev => ({ ...prev, isGoogleConnected: true }));
  };

  if (state.isLoading) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box
          display="flex"
          flexDirection="column"
          justifyContent="center"
          alignItems="center"
          minHeight="100vh"
          bgcolor="background.default"
        >
          <Box mb={3}>
            <Box mb={2}>
              <img 
                src={ekrnLogo} 
                alt="eKROWN Technologies" 
                style={{ width: '80px', height: '80px', marginBottom: '1rem' }}
              />
            </Box>
            <Typography variant="h4" component="h1" gutterBottom color="primary">
              eKROWN|Technologies
            </Typography>
            <Typography variant="subtitle1" color="text.secondary" align="center">
              AI Assistant for Google Classroom
            </Typography>
          </Box>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 2, textAlign: 'center' }}>
            Initializing application...
          </Typography>
        </Box>
      </ThemeProvider>
    );
  }

  if (state.error) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box
          display="flex"
          flexDirection="column"
          justifyContent="center"
          alignItems="center"
          minHeight="100vh"
          bgcolor="background.default"
          p={3}
        >
          <Alert severity="error" sx={{ maxWidth: 600, mb: 2 }}>
            <Typography variant="h6" gutterBottom>
              Application Error
            </Typography>
            <Typography variant="body2" sx={{ mb: 2 }}>
              {state.error}
            </Typography>
            <Button variant="outlined" onClick={handleRetry} size="small">
              Retry Initialization
            </Button>
          </Alert>
          
          <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1, maxWidth: 600 }}>
            <Typography variant="subtitle2" gutterBottom>
              Debug Information:
            </Typography>
            <Typography variant="body2" component="pre" sx={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>
              {`Retry attempts: ${retryCount}
User Agent: ${navigator.userAgent}
Window keys: ${Object.keys(window).join(', ')}
electronAPI: ${typeof window.electronAPI}`}
            </Typography>
          </Box>
        </Box>
      </ThemeProvider>
    );
  }

  return (
    <ClaudeStatusProvider>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Router>
          <AppInitializer isAuthenticated={state.isAuthenticated}>
            {state.isAuthenticated ? (
              <Box display="flex" minHeight="100vh">
                <Navigation 
                  user={state.user} 
                  license={state.license}
                  onLogout={handleLogout} 
                  isGoogleConnected={state.isGoogleConnected}
                  isSetupComplete={state.isSetupComplete}
                />
                <Box component="main" flexGrow={1} bgcolor="background.default">
                  <Routes>
                    <Route 
                      path="/" 
                      element={
                        state.isSetupComplete ? 
                          <Dashboard user={state.user} license={state.license} /> :
                          <Navigate to="/setup" replace />
                      } 
                    />
                    <Route 
                      path="/dashboard" 
                      element={<Dashboard user={state.user} license={state.license} />} 
                    />
                    <Route 
                      path="/setup" 
                      element={
                        <SetupWizard 
                          user={state.user}
                          onComplete={handleSetupComplete}
                          onGoogleConnected={handleGoogleConnected}
                          onClaudeReady={() => console.log('Claude reported ready from SetupWizard (via context)')}
                        />
                      } 
                    />
                    <Route 
                      path="/settings" 
                      element={<Settings user={state.user} license={state.license} />} 
                    />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </Box>
              </Box>
            ) : (
              <LoginScreen onAuthSuccess={handleAuthSuccess} />
            )}
          </AppInitializer>
        </Router>
      </ThemeProvider>
    </ClaudeStatusProvider>
  );
};

export default App; 