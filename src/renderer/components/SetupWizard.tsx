import React, { useState, useEffect, useCallback } from 'react';
import { 
  Box, 
  Typography, 
  Button, 
  Card, 
  CardContent, 
  Stepper,
  Step,
  StepLabel,
  Alert,
  TextField,
  CircularProgress,
  Link
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useClaudeStatus } from '../contexts/ClaudeStatusContext';

interface SetupWizardProps {
  user: any;
  onComplete: () => Promise<void>;
  onGoogleConnected: () => void;
  onClaudeReady: () => void;
}

const steps = [
  'Welcome',
  'Google Credentials',
  'Stripe Payment',
  'Claude Desktop',
  'Complete'
];

const SetupWizard: React.FC<SetupWizardProps> = ({ user, onComplete, onGoogleConnected, onClaudeReady }) => {
  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const navigate = useNavigate();
  
  const {
    claudeDetectionStatus,
    claudeInstallPath,
    claudeVersion,
    claudeDetectionError,
    mcpLaunchStatus,
    mcpLaunchError,
    checkClaudeDetection: contextCheckClaudeDetection,
    launchMcpAndClaude,
  } = useClaudeStatus();

  const [credentials, setCredentials] = useState({
    clientId: '',
    clientSecret: ''
  });
  const [isPaymentSetupComplete, setIsPaymentSetupComplete] = useState(false);
  const [paymentPollingActive, setPaymentPollingActive] = useState(false);

  // Don't auto-load credentials to prevent pre-population during setup
  // Users should enter credentials manually during setup for security
  const loadExistingCredentials = async () => {
    // Removed auto-loading to prevent pre-population during setup wizard
    // This ensures users consciously enter their credentials during setup
    console.log('Credentials not auto-loaded during setup wizard for security');
  };

  // Payment polling function for better user experience
  const startPaymentPolling = useCallback(() => {
    setPaymentPollingActive(true);
    let pollCount = 0;
    const maxPolls = 60; // 5 minutes of polling
    
    const pollInterval = setInterval(async () => {
      pollCount++;
      
      try {
        const paymentCheck = await window.electronAPI.subscription.checkAfterPayment();
        if (paymentCheck.success && paymentCheck.subscriptionActive) {
          setSuccess('Payment method configured successfully! You can now continue to the next step.');
          setIsPaymentSetupComplete(true);
          setPaymentPollingActive(false);
          clearInterval(pollInterval);
          return;
        }
      } catch (error) {
        console.log('Payment check failed, continuing to poll...', error);
      }
      
      if (pollCount >= maxPolls) {
        setPaymentPollingActive(false);
        clearInterval(pollInterval);
        setError('Payment verification timed out. Please click "Check Payment Status" to manually verify your payment.');
      }
    }, 5000); // Check every 5 seconds
  }, []);

  // Manual payment check function
  const handleManualPaymentCheck = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const paymentCheck = await window.electronAPI.subscription.checkAfterPayment();
      if (paymentCheck.success && paymentCheck.subscriptionActive) {
        setSuccess('Payment method configured successfully! You can now continue to the next step.');
        setIsPaymentSetupComplete(true);
        setPaymentPollingActive(false);
      } else {
        setError('Payment not yet processed. Please complete payment in the browser tab or wait a few more minutes and try again.');
      }
    } catch (error) {
      setError('Could not verify payment status. Please ensure payment is complete and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    setActiveStep((prevActiveStep) => prevActiveStep + 1);
    setError(null);
    setSuccess(null);
  };

  const handleBack = () => {
    setActiveStep((prevActiveStep) => prevActiveStep - 1);
    setError(null);
    setSuccess(null);
  };

  const handleStartSetup = () => {
    handleNext();
  };

  const handleStripeSetup = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    const proPlanPriceId = 'price_1RZ7XYDFOqrH8dpSyfxS0nWJ';

    if (!user || !user.id) {
      console.error('User ID is not available. Cannot proceed with payment setup.');
      setError('Error: User information is missing. Please try logging out and back in.');
      setLoading(false);
      return;
    }

    try {
      console.log(`Attempting to create Stripe checkout session for Price ID: ${proPlanPriceId}, User ID: ${user.id}`);
      const result = await window.electronAPI.stripe.createCheckoutSession(proPlanPriceId, user.id);
      if (result && result.success && result.url) {
        console.log('Stripe checkout session created, opening URL:', result.url);
        setSuccess('Redirecting to secure payment setup...');
        await window.electronAPI.system.openExternal(result.url);
        
        // Start more robust payment polling
        setSuccess('Payment window opened. Complete payment in the browser and return here...');
        startPaymentPolling();
      } else {
        console.error('Failed to create Stripe checkout session:', result?.error);
        setError(`Could not initiate payment setup: ${result?.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error during Stripe checkout process:', error);
      setError('An unexpected error occurred while trying to set up payment.');
    } finally {
      setLoading(false);
    }
  };

  const handleCredentialsSave = async () => {
    if (!credentials.clientId || !credentials.clientSecret) {
      setError('Please enter both Client ID and Client Secret');
      return;
    }

    // Basic validation
    if (!credentials.clientId.includes('.apps.googleusercontent.com')) {
      setError('Client ID should end with .apps.googleusercontent.com');
      return;
    }

    if (credentials.clientSecret.length < 20) {
      setError('Client Secret appears to be too short. Please check and try again.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.credentials.save({
        clientId: credentials.clientId.trim(),
        clientSecret: credentials.clientSecret.trim(),
        credentialType: 'oauth' as const,
        displayName: 'OAuth2 Credentials',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      if (result.success) {
        setSuccess('Credentials saved successfully! You can now proceed.');
        onGoogleConnected();
        setTimeout(() => {
          handleNext();
        }, 1000);
      } else {
        // Provide user-friendly error messages
        let userFriendlyError = result.error || 'Failed to save credentials';
        
        if (userFriendlyError.includes('Invalid or missing credential type')) {
          userFriendlyError = 'Internal error: credential type missing. Please try again.';
        } else if (userFriendlyError.includes('Client ID')) {
          userFriendlyError = 'Please check your Client ID format and try again.';
        } else if (userFriendlyError.includes('Client Secret')) {
          userFriendlyError = 'Please check your Client Secret and try again.';
        } else if (userFriendlyError.includes('keytar') || userFriendlyError.includes('encryption')) {
          userFriendlyError = 'Unable to securely store credentials. Please check your system permissions.';
        }
        
        setError(userFriendlyError);
      }
    } catch (error) {
      console.error('Credential save error:', error);
      setError('An unexpected error occurred. Please try again or check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleClaudeDetectionFromWizard = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    await contextCheckClaudeDetection();
    setLoading(false);
  }, [contextCheckClaudeDetection]);

  const handleProceedWithClaudeConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    if (claudeDetectionStatus !== 'detected') {
      setError('Claude Desktop must be detected before proceeding. Please run detection.');
      setLoading(false);
      return;
    }

    await launchMcpAndClaude();
  }, [launchMcpAndClaude, claudeDetectionStatus]);

  useEffect(() => {
    if (mcpLaunchStatus === 'active') {
      setSuccess('Claude Desktop configured with MCP successfully!');
      onClaudeReady();
      setLoading(false);
      setTimeout(() => {
        if (activeStep === 3) {
          handleNext();
        }
      }, 1500);
    } else if (mcpLaunchStatus === 'failed') {
      setError(mcpLaunchError || 'Failed to configure Claude with MCP. Please check logs or try again.');
      setLoading(false);
    }
  }, [mcpLaunchStatus, mcpLaunchError, onClaudeReady, activeStep]);

  // Clean up polling on component unmount
  useEffect(() => {
    return () => {
      setPaymentPollingActive(false);
    };
  }, []);

  const handleComplete = async () => {
    if (mcpLaunchStatus === 'active') {
      setSuccess('Setup completed successfully!');
      setLoading(true);
      
      try {
        // Wait for setup completion to be saved
        await onComplete();
        
        setTimeout(() => {
          navigate('/dashboard');
        }, 1500);
      } catch (error) {
        console.error('Error completing setup:', error);
        setError('Failed to save setup completion. Please try again.');
        setLoading(false);
      }
    } else {
      setError('Claude Desktop & MCP setup was not completed. Please go back and ensure Claude is configured.');
    }
  };

  const renderStepContent = (step: number) => {
    switch (step) {
      case 0:
        return (
          <Box>
            <Typography variant="h6" gutterBottom>
              Welcome to eKROWN Classroom AI Assistant!
            </Typography>
            <Typography paragraph>
              Let's get you set up. This wizard will help you configure Google Classroom API credentials and Claude Desktop integration.
            </Typography>
            <Typography paragraph>
              <strong>What you'll need:</strong>
            </Typography>
            <ul>
              <li>Google Cloud Console OAuth2 credentials</li>
              <li>Claude Desktop installed on your computer</li>
              <li>About 5 minutes of your time</li>
            </ul>
            <Button 
              variant="contained" 
              onClick={handleStartSetup}
              size="large"
            >
              START TRIAL SETUP
            </Button>
          </Box>
        );

      case 1:
        return (
          <Box>
            <Typography variant="h6" gutterBottom>
              Google API Credentials
            </Typography>
            <Typography paragraph>
              Enter your Google OAuth2 credentials from Google Cloud Console:
            </Typography>
            
            <TextField
              fullWidth
              label="Google Client ID"
              value={credentials.clientId}
              onChange={(e) => setCredentials(prev => ({ ...prev, clientId: e.target.value }))}
              placeholder="123456789-abc123def456ghi789jkl012mno345pqr678stu.apps.googleusercontent.com"
              margin="normal"
              helperText="From Google Cloud Console > APIs & Services > Credentials"
            />
            
            <TextField
              fullWidth
              label="Google Client Secret"
              value={credentials.clientSecret}
              onChange={(e) => setCredentials(prev => ({ ...prev, clientSecret: e.target.value }))}
              placeholder="GOCSPX-abcdefghijklmnopqrstuvwxyz123456"
              margin="normal"
              type="password"
              helperText="Keep this secret and secure"
            />

            <Box mt={2}>
              <Typography variant="body2" color="text.secondary">
                Don't have credentials yet? <Link href="#" onClick={() => window.electronAPI.system.openExternal('https://console.cloud.google.com/')}>
                  Set them up in Google Cloud Console
                </Link>
              </Typography>
            </Box>

            <Box mt={3} display="flex" gap={2}>
              <Button onClick={handleBack}>
                Back
              </Button>
              <Button 
                variant="contained" 
                onClick={handleCredentialsSave}
                disabled={loading || !credentials.clientId || !credentials.clientSecret}
              >
                {loading ? <CircularProgress size={24} /> : 'Save & Continue'}
              </Button>
            </Box>
          </Box>
        );

      case 2:
        return (
          <Box>
            <Typography variant="h6" gutterBottom>
              Trial Setup & Payment Method
            </Typography>
            <Typography paragraph>
              Set up your payment method to activate your 14-day free trial. You won't be charged during the trial period.
            </Typography>
            
            <Alert severity="info" sx={{ my: 2 }}>
              <Typography variant="body2" gutterBottom>
                <strong>14-Day Free Trial</strong>
              </Typography>
              <Typography variant="body2">
                • Full access to all features during trial period<br/>
                • No charges during the first 14 days<br/>
                • Cancel anytime before trial ends<br/>
                • Automatic billing starts after trial expires
              </Typography>
            </Alert>

            {!isPaymentSetupComplete && (
              <Alert severity="warning" sx={{ my: 2 }}>
                <Typography variant="body2">
                  <strong>Payment method setup required</strong><br/>
                  You must configure your payment method before proceeding to the next step.
                </Typography>
              </Alert>
            )}

            {isPaymentSetupComplete && (
              <Alert severity="success" sx={{ my: 2 }}>
                <Typography variant="body2">
                  <strong>Payment method configured!</strong><br/>
                  You can now continue to the next step.
                </Typography>
              </Alert>
            )}

            <Box mt={3} display="flex" flexDirection="column" gap={2}>
              <Button 
                variant={isPaymentSetupComplete ? "outlined" : "contained"}
                onClick={handleStripeSetup}
                disabled={loading || isPaymentSetupComplete}
                size="large"
                color={isPaymentSetupComplete ? "success" : "primary"}
              >
                {loading ? (
                  <CircularProgress size={24} sx={{color: 'white'}}/>
                ) : isPaymentSetupComplete ? (
                  'Payment Configured'
                ) : (
                  'Set Up Payment Method'
                )}
              </Button>
              
              {paymentPollingActive && (
                <Button 
                  variant="outlined"
                  onClick={handleManualPaymentCheck}
                  disabled={loading}
                  size="large"
                >
                  {loading ? <CircularProgress size={24} /> : 'Check Payment Status'}
                </Button>
              )}
              
              <Typography variant="body2" color="text.secondary" align="center">
                {isPaymentSetupComplete ? 
                  'Payment method successfully configured • Continue to next step' :
                  paymentPollingActive ?
                  'Complete payment in browser, then click "Check Payment Status"' :
                  'Secured by Stripe • No charge during trial period'
                }
              </Typography>
            </Box>

            <Box mt={3} display="flex" justifyContent="space-between">
              <Button onClick={handleBack} disabled={loading}>Back</Button>
              <Button 
                variant="contained" 
                onClick={handleNext}
                disabled={loading || !isPaymentSetupComplete}
              >
                Continue
              </Button>
            </Box>
          </Box>
        );

      case 3:
        return (
          <Box>
            <Typography variant="h6" gutterBottom>
              Claude Desktop Integration
            </Typography>
            <Typography paragraph>
              We'll automatically configure Claude Desktop to work with Google Classroom. 
              This process will detect your Claude installation and set up the secure connection.
            </Typography>
            
            <Alert severity="info" sx={{ my: 2 }}>
              <Typography variant="body2" gutterBottom>
                <strong>Automatic Configuration</strong>
              </Typography>
              <Typography variant="body2">
                • Detects Claude Desktop on your computer<br/>
                • Creates secure configuration files automatically<br/>
                • No manual file editing required<br/>
                • Works on Windows, Mac, and Linux
              </Typography>
            </Alert>
            {claudeDetectionStatus === 'unknown' || claudeDetectionStatus === 'checking' ? (
              <Box sx={{ display: 'flex', alignItems: 'center', my: 2 }}>
                <CircularProgress size={24} sx={{ mr: 1 }} />
                <Typography>Checking Claude Desktop status...</Typography>
              </Box>
            ) : claudeDetectionStatus === 'not_found' ? (
              <Alert severity="error" sx={{ my: 2 }}>
                Claude Desktop not found. {claudeDetectionError || 'Please ensure it is installed.'}
                <br />
                <Link href="#" onClick={(e) => { e.preventDefault(); /* Show install instructions */ alert('Install instructions (TODO: implement modal from ClaudeDetectionService.getInstallInstructions())'); }}>
                  View Installation Instructions
                </Link>
              </Alert>
            ) : claudeDetectionStatus === 'detected' ? (
              <Box>
                <Alert severity="success" sx={{ my: 2 }}>
                  Claude Desktop Detected!
                  {claudeVersion && <Typography variant="body2">Version: {claudeVersion}</Typography>}
                  {claudeInstallPath && <Typography variant="body2">Path: {claudeInstallPath}</Typography>}
                </Alert>
                <Alert severity="warning" sx={{ my: 2 }}>
                  <Typography variant="body2" gutterBottom>
                    <strong>Important:</strong> Model Context Protocol (MCP) features require a paid Claude subscription (Pro or Team).
                  </Typography>
                  <Typography variant="body2">
                    If you have a free Claude account, please upgrade to Claude Pro to use this assistant.{' '}
                    <Link href="#" onClick={() => window.electronAPI.system.openExternal('https://claude.ai/subscription')}>
                      Upgrade to Claude Pro
                    </Link>
                  </Typography>
                </Alert>
              </Box>
            ) : null}

            {success && activeStep === 3 && <Alert severity="success" sx={{ my: 1 }}>{success}</Alert>}
            {error && activeStep === 3 && <Alert severity="error" sx={{ my: 1 }}>{error}</Alert>}
            {mcpLaunchStatus === 'failed' && activeStep === 3 && !error && (
                <Alert severity="error" sx={{my: 1}}>{mcpLaunchError || 'MCP Launch Failed'}</Alert>
            )}

            <Box mt={2} display="flex" flexDirection="column" gap={2}>
              {claudeDetectionStatus !== 'detected' && (
                <Button 
                  variant="outlined" 
                  onClick={handleClaudeDetectionFromWizard} 
                  disabled={loading || claudeDetectionStatus === 'checking'}
                >
                  {claudeDetectionStatus === 'checking' ? 'Checking...' : 'Check for Claude Desktop'}
                </Button>
              )}

              {claudeDetectionStatus === 'detected' && (
                <Button 
                  variant="contained" 
                  onClick={handleProceedWithClaudeConfig} 
                  disabled={loading || mcpLaunchStatus === 'starting' || mcpLaunchStatus === 'active'}
                >
                  {mcpLaunchStatus === 'starting' ? <CircularProgress size={24} sx={{color: 'white'}}/> : (mcpLaunchStatus === 'active' ? 'Setup Complete!' : 'Automatically Configure Claude Desktop')}
                </Button>
              )}
            </Box>

            <Box mt={3} display="flex" justifyContent="space-between">
              <Button onClick={handleBack} disabled={loading}>Back</Button>
              <Button 
                variant="contained" 
                onClick={handleNext}
                disabled={loading || activeStep === steps.length - 1 || mcpLaunchStatus !== 'active'}
              >
                Next
              </Button>
            </Box>
          </Box>
        );

      case 4:
        return (
          <Box>
            <Typography variant="h6" gutterBottom>
              Setup Complete!
            </Typography>
            <Typography paragraph>
              Your eKROWN Classroom AI Assistant is now configured and ready to use!
            </Typography>
            
            <Typography paragraph>
              <strong>What's next?</strong>
            </Typography>
            <ul>
              <li>Access your Dashboard to see current status</li>
              <li>Try asking Claude about your Google Classroom courses</li>
              <li>Explore Settings for advanced configuration</li>
            </ul>

            <Box mt={3}>
              <Button 
                variant="contained" 
                onClick={handleComplete}
                disabled={loading}
                size="large"
              >
                {loading ? <CircularProgress size={24} /> : 'Go to Dashboard'}
              </Button>
            </Box>
          </Box>
        );

      default:
        return 'Unknown step';
    }
  };

  return (
    <Box p={3}>
      <Typography variant="h4" gutterBottom>
        Setup Wizard
      </Typography>
      
      <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
        {steps.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {success}
        </Alert>
      )}
      
      <Card>
        <CardContent>
          {renderStepContent(activeStep)}
        </CardContent>
      </Card>
    </Box>
  );
};

export default SetupWizard; 