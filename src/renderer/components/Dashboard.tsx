import React, { useState, useEffect, useCallback } from 'react';
import { 
  Box, 
  Typography, 
  Card, 
  CardContent, 
  Grid, 
  Button, 
  Chip,
  Alert,
  CircularProgress,
  Paper,
  Divider,
  Link
} from '@mui/material';
import { 
  PlayArrow as StartIcon,
  Stop as StopIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Error as ErrorIcon
} from '@mui/icons-material';
import { useClaudeStatus } from '../contexts/ClaudeStatusContext';

interface DashboardProps {
  user: any;
  license: any;
}

const Dashboard: React.FC<DashboardProps> = ({ user, license }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<'start' | 'stop' | null>(null);

  const {
    claudeDetectionStatus,
    claudeVersion,
    mcpLaunchStatus,
    mcpLaunchError,
    launchMcpAndClaude,
    stopMcpAndClaude,
  } = useClaudeStatus();

  const handleStartAssistant = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    setLastAction('start');
    await launchMcpAndClaude();
  }, [launchMcpAndClaude]);

  const handleStopAssistant = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    setLastAction('stop');
    await stopMcpAndClaude();
  }, [stopMcpAndClaude]);

  useEffect(() => {
    if (mcpLaunchStatus === 'active' && loading && lastAction === 'start') {
      setSuccess('Assistant started successfully!');
      setLoading(false);
      setLastAction(null);
    } else if (mcpLaunchStatus === 'inactive' && loading && lastAction === 'stop') {
      setSuccess('Assistant stopped successfully.');
      setLoading(false);
      setLastAction(null);
    } else if (mcpLaunchStatus === 'failed' && loading) {
      setError(mcpLaunchError || 'Operation failed. Please check logs.');
      setLoading(false);
      setLastAction(null);
    }
  }, [mcpLaunchStatus, mcpLaunchError, loading, lastAction]);

  const formatUptime = (seconds?: number) => {
    if (!seconds) return 'N/A';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    
    return `${hours}h ${minutes}m ${remainingSeconds}s`;
  };

  const getStatusChip = (statusKey: string, detectionStatus?: string, launchStatus?: string, version?: string) => {
    if (statusKey === 'claude') {
      if (detectionStatus === 'detected') {
        if (launchStatus === 'active') {
          return <Chip icon={<CheckCircleIcon />} label={`Active ${version ? `(v${version})` : ''}`} color="success" size="small" />;
        }
        return <Chip icon={<WarningIcon />} label={`Detected ${version ? `(v${version})` : ''}`} color="info" size="small" />;
      }
      return <Chip icon={<ErrorIcon />} label="Not Found" color="error" size="small" />;
    } else if (statusKey === 'mcp') {
      if (launchStatus === 'active') {
        return <Chip icon={<CheckCircleIcon />} label="Active" color="success" size="small" />;
      }
      return <Chip icon={<ErrorIcon />} label="Inactive" color="error" size="small" />;
    } else if (statusKey === 'license') {
        if (detectionStatus === 'active' || detectionStatus === 'running') {
            return <Chip icon={<CheckCircleIcon />} label="Active" color="success" size="small" />;
        } else if (detectionStatus === 'trial') {
            return <Chip icon={<WarningIcon />} label="Trial" color="warning" size="small" />;
        }
    }
    return <Chip icon={<ErrorIcon />} label="Inactive" color="error" size="small" />;
  };

  return (
    <Box p={3}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">
          Dashboard
        </Typography>
        <Box>
          <Button 
            variant="contained" 
            color="primary" 
            startIcon={<StartIcon />}
            onClick={handleStartAssistant}
            disabled={loading || mcpLaunchStatus === 'active' || mcpLaunchStatus === 'starting'}
            sx={{ mr: 1 }}
          >
            {(loading && mcpLaunchStatus === 'starting') ? <CircularProgress size={24} /> : 'Start Assistant'}
          </Button>
          <Button 
            variant="outlined" 
            color="error" 
            startIcon={<StopIcon />}
            onClick={handleStopAssistant}
            disabled={loading || mcpLaunchStatus === 'inactive' || mcpLaunchStatus === 'failed' }
          >
            {(loading && mcpLaunchStatus !== 'inactive' && mcpLaunchStatus !== 'failed') ? <CircularProgress size={24} /> : 'Stop'}
          </Button>
        </Box>
      </Box>
      
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
      
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Account Information
              </Typography>
              <Box mb={2}>
                <Typography variant="body1"><strong>Email:</strong> {user?.email}</Typography>
                <Typography variant="body1">
                  <strong>Account Type:</strong> {user?.user_metadata?.firstName || 'User'}
                </Typography>
                <Typography variant="body1">
                  <strong>Subscription:</strong> {license?.license_type || license?.planName || 'Basic'} {getStatusChip('license', license?.status, undefined, undefined)}
                </Typography>
                {license?.status === 'trial' && license?.daysRemaining && (
                  <>
                    <Typography variant="body2" color="warning.main">
                      Trial expires in {license.daysRemaining} days
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Current plan: $20/month Pro Plan (starts after trial)
                    </Typography>
                  </>
                )}
                {license?.status === 'active' && (
                  <Typography variant="body2" color="success.main">
                    Active subscription - $20/month Pro Plan
                  </Typography>
                )}
              </Box>

              {/* Subscription Management */}
              <Divider sx={{ my: 2 }} />
              
              <Typography variant="h6" gutterBottom>
                Subscription Management
              </Typography>
              
              {license?.status === 'trial' && (
                <Box mb={2}>
                  <Alert severity="info" sx={{ mb: 2 }}>
                    <Typography variant="body2">
                      <strong>Free Trial Active</strong><br/>
                      Enjoy full access during your trial period. Billing will begin automatically when your trial ends.
                    </Typography>
                  </Alert>
                  <Button
                    variant="contained"
                    color="primary"
                    size="small"
                    onClick={async () => {
                      try {
                        const result = await window.electronAPI.stripe.createCheckoutSession('price_1RZ7XYDFOqrH8dpSyfxS0nWJ', user.id);
                        if (result && result.success && result.url) {
                          window.electronAPI.system.openExternal(result.url);
                        } else {
                          setError(`Could not open billing portal: ${result?.error || 'Unknown error'}`);
                        }
                      } catch (error) {
                        setError('An unexpected error occurred while accessing billing.');
                      }
                    }}
                    sx={{ mr: 1 }}
                  >
                    Upgrade to Pro Now
                  </Button>
                </Box>
              )}
              
              {license?.status === 'active' && (
                <Box mb={2}>
                  <Alert severity="success" sx={{ mb: 2 }}>
                    <Typography variant="body2">
                      <strong>Pro Subscription Active</strong><br/>
                      You have unlimited access to all features.
                    </Typography>
                  </Alert>
                  <Button
                    variant="outlined"
                    color="primary"
                    size="small"
                    onClick={() => window.electronAPI.system.openExternal('https://billing.stripe.com/p/login')}
                  >
                    Manage Billing
                  </Button>
                </Box>
              )}

              <Divider sx={{ my: 2 }} />
              
              <Typography variant="h6" gutterBottom>
                System Status
              </Typography>
              <Box>
                <Typography variant="body1">
                  <strong>Claude Desktop:</strong> {getStatusChip('claude', claudeDetectionStatus, mcpLaunchStatus, claudeVersion)}
                </Typography>
                <Typography variant="body1">
                  <strong>MCP Server:</strong> {getStatusChip('mcp', undefined, mcpLaunchStatus)}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Usage Statistics
              </Typography>
              {license?.status === 'trial' && (
                <Box mb={2}>
                  <Typography variant="body2" color="text.secondary">
                    <strong>Trial Usage Today:</strong>
                  </Typography>
                  <Typography variant="body1">
                    CRUD Operations: 0/1 daily limit
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Read operations: Unlimited
                  </Typography>
                </Box>
              )}
              
              {license?.status === 'active' && (
                <Box mb={2}>
                  <Typography variant="body2" color="success.main">
                    <strong>Pro Account:</strong> Unlimited access to all features
                  </Typography>
                </Box>
              )}
              
              <Divider sx={{ my: 2 }} />
              
              <Typography variant="h6" gutterBottom>
                Quick Guide
              </Typography>
              <Typography variant="body1" paragraph>
                Your Claude AI Assistant is integrated with Google Classroom and ready to help with:
              </Typography>
              
              <ul>
                <li><strong>Course Management:</strong> View and organize your classes</li>
                <li><strong>Assignment Creation:</strong> Generate assignments and rubrics</li>
                <li><strong>Student Progress:</strong> Track submissions and performance</li>
                <li><strong>Content Generation:</strong> Create educational materials</li>
              </ul>
              
              <Divider sx={{ my: 2 }} />
              
              <Typography variant="h6" gutterBottom>
                Support & Help
              </Typography>
              <Box display="flex" flexDirection="column" gap={1}>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => window.electronAPI.system.openExternal('https://docs.ekrown.com/google-classroom-mcp')}
                >
                  📖 View Documentation
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => window.electronAPI.system.openExternal('mailto:support@ekrown.com?subject=Classroom AI Assistant Support')}
                >
                  📧 Contact Support
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => window.electronAPI.system.openExternal('https://claude.ai/subscription')}
                >
                  🔗 Claude Pro Subscription
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        
        {mcpLaunchStatus === 'active' && (
          <Grid item xs={12}>
            <Paper elevation={1} sx={{ p: 2, bgcolor: 'background.default' }}>
              <Typography variant="subtitle2" gutterBottom>
                Assistant Status
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Claude Desktop and MCP Server are active.
              </Typography>
            </Paper>
          </Grid>
        )}
      </Grid>
    </Box>
  );
};

export default Dashboard; 