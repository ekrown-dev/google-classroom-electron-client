import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  Tab,
  Tabs,
  CircularProgress
} from '@mui/material';
import ekrnLogo from '../assets/eKRN-logo.png';

interface LoginScreenProps {
  onAuthSuccess: (user: any) => void;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`auth-tabpanel-${index}`}
      aria-labelledby={`auth-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onAuthSuccess }) => {
  const [tabValue, setTabValue] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Sign In Form
  const [signInData, setSignInData] = useState({
    email: '',
    password: ''
  });

  // Sign Up Form
  const [signUpData, setSignUpData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    organization: ''
  });

  // Add a state for success message
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
    setError(null);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.supabase.signIn(
        signInData.email,
        signInData.password
      );

      if (result.error) {
        // Provide user-friendly error messages
        if (result.error.includes('Email not confirmed')) {
          setError('Please check your email and click the confirmation link before signing in. Check your spam folder if you don\'t see the email.');
        } else if (result.error.includes('Invalid login credentials')) {
          setError('Invalid email or password. Please check your credentials and try again.');
        } else if (result.error.includes('Email link is invalid')) {
          setError('The email confirmation link has expired. Please sign up again to receive a new confirmation email.');
        } else {
          setError(result.error);
        }
      } else if (result.success && result.user) {
        onAuthSuccess(result.user);
      } else {
        setError('Sign in failed - no user returned');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Sign in failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    if (signUpData.password !== signUpData.confirmPassword) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    try {
      const result = await window.electronAPI.supabase.signUp(
        signUpData.email,
        signUpData.password,
        {
          firstName: signUpData.firstName,
          lastName: signUpData.lastName,
          organization: signUpData.organization
        }
      );

      if (result.success && result.user) {
        setSuccessMessage('Sign up successful! Please check your email for a confirmation link to activate your account.');
        // Clear the form fields
        setSignUpData({
          email: '',
          password: '',
          confirmPassword: '',
          firstName: '',
          lastName: '',
          organization: ''
        });
        // Do not call onAuthSuccess immediately. User must confirm email first.
      } else if (result.error) {
        setError(result.error);
      } else {
        setError('Sign up failed - no user returned');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Sign up failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box
      display="flex"
      justifyContent="center"
      alignItems="center"
      minHeight="100vh"
      bgcolor="background.default"
      p={3}
    >
      <Card sx={{ maxWidth: 500, width: '100%' }}>
        <CardContent>
          <Box textAlign="center" mb={3}>
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
            <Typography variant="subtitle1" color="text.secondary">
              AI Assistant for Google Classroom
            </Typography>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
              {error.includes('email rate limit') && (
                <Box sx={{ mt: 1 }}>
                  <Typography variant="body2">
                    Email rate limit reached. You can:
                  </Typography>
                  <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                    <li>Wait 1 hour for rate limit to reset</li>
                    <li>Try signing in with an existing account instead</li>
                    <li>Use the test auth script: <code>./test-auth-callback.sh</code></li>
                  </ul>
                </Box>
              )}
            </Alert>
          )}

          {successMessage && (
            <Alert severity="success" sx={{ mb: 2 }}>
              {successMessage}
            </Alert>
          )}

          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tabs value={tabValue} onChange={handleTabChange} aria-label="auth tabs">
              <Tab label="Sign In" />
              <Tab label="Sign Up" />
            </Tabs>
          </Box>

          <TabPanel value={tabValue} index={0}>
            <Box component="form" onSubmit={handleSignIn}>
              <TextField
                fullWidth
                label="Email"
                type="email"
                value={signInData.email}
                onChange={(e) => setSignInData(prev => ({ ...prev, email: e.target.value }))}
                margin="normal"
                required
              />
              <TextField
                fullWidth
                label="Password"
                type="password"
                value={signInData.password}
                onChange={(e) => setSignInData(prev => ({ ...prev, password: e.target.value }))}
                margin="normal"
                required
              />
              <Button
                type="submit"
                fullWidth
                variant="contained"
                sx={{ mt: 3, mb: 2 }}
                disabled={isLoading}
              >
                {isLoading ? <CircularProgress size={24} /> : 'Sign In'}
              </Button>
            </Box>
          </TabPanel>

          <TabPanel value={tabValue} index={1}>
            <Box component="form" onSubmit={handleSignUp}>
              <Box display="flex" gap={2}>
                <TextField
                  fullWidth
                  label="First Name"
                  value={signUpData.firstName}
                  onChange={(e) => setSignUpData(prev => ({ ...prev, firstName: e.target.value }))}
                  margin="normal"
                  required
                />
                <TextField
                  fullWidth
                  label="Last Name"
                  value={signUpData.lastName}
                  onChange={(e) => setSignUpData(prev => ({ ...prev, lastName: e.target.value }))}
                  margin="normal"
                  required
                />
              </Box>
              <TextField
                fullWidth
                label="Email"
                type="email"
                value={signUpData.email}
                onChange={(e) => setSignUpData(prev => ({ ...prev, email: e.target.value }))}
                margin="normal"
                required
              />
              <TextField
                fullWidth
                label="Organization (Optional)"
                value={signUpData.organization}
                onChange={(e) => setSignUpData(prev => ({ ...prev, organization: e.target.value }))}
                margin="normal"
              />
              <TextField
                fullWidth
                label="Password"
                type="password"
                value={signUpData.password}
                onChange={(e) => setSignUpData(prev => ({ ...prev, password: e.target.value }))}
                margin="normal"
                required
              />
              <TextField
                fullWidth
                label="Confirm Password"
                type="password"
                value={signUpData.confirmPassword}
                onChange={(e) => setSignUpData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                margin="normal"
                required
              />
              <Button
                type="submit"
                fullWidth
                variant="contained"
                sx={{ mt: 3, mb: 2 }}
                disabled={isLoading}
              >
                {isLoading ? <CircularProgress size={24} /> : 'Sign Up'}
              </Button>
            </Box>
          </TabPanel>
        </CardContent>
      </Card>
    </Box>
  );
};

export default LoginScreen; 