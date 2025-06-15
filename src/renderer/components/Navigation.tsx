import React from 'react';
import {
  Box,
  Drawer,
  List,
  ListItem,
  ListItemText,
  ListItemButton,
  Typography,
  Divider,
  Button,
  useTheme
} from '@mui/material';
import { useNavigate, useLocation } from 'react-router-dom';
import { useClaudeStatus } from '../contexts/ClaudeStatusContext';

const DRAWER_WIDTH = 280;

interface NavigationProps {
  user: any;
  license: any;
  onLogout: () => void;
  isGoogleConnected: boolean;
  isSetupComplete: boolean;
}

const Navigation: React.FC<NavigationProps> = ({ user, license, onLogout, isGoogleConnected, isSetupComplete }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();

  const {
    claudeDetectionStatus,
    mcpLaunchStatus
  } = useClaudeStatus();

  const getLicenseStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'success';
      case 'trial': return isSetupComplete ? 'success' : 'warning';
      case 'expired': return 'error';
      default: return 'default';
    }
  };

  const getLicenseStatusText = (license: any) => {
    if (!license) return 'No License';
    
    if (license.status === 'trial') {
      const daysLeft = Math.ceil((new Date(license.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      return `Trial (${daysLeft} days left)`;
    }
    
    return license.plan_name || 'Active';
  };

  const menuItems = [
    {
      text: 'Dashboard',
      path: '/',
      description: 'Overview and status'
    },
    {
      text: 'Settings',
      path: '/settings',
      description: 'App configuration'
    }
  ];

  // Force navigation to dashboard for testing
  const forceDashboard = () => {
    console.log('Force dashboard navigation triggered');
    navigate('/dashboard');
  };

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: DRAWER_WIDTH,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: DRAWER_WIDTH,
          boxSizing: 'border-box',
          backgroundColor: theme.palette.grey[50],
          borderRight: `1px solid ${theme.palette.divider}`,
        },
      }}
    >
      {/* Header */}
      <Box sx={{ p: 2, textAlign: 'center' }}>
        <Typography variant="h6" component="h1" color="primary" fontWeight="bold">
          Classroom AI
        </Typography>
        <Typography variant="caption" color="text.secondary">
          eKROWN Professional Desktop App
        </Typography>
      </Box>

      <Divider />

      {/* User Info */}
      <Box sx={{ p: 2 }}>
        <Box mb={1}>
          <Typography variant="body2" fontWeight="medium" noWrap>
            {user.user_metadata?.firstName || user.email?.split('@')[0] || 'User'}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            {user.email}
          </Typography>
        </Box>

        {/* License Status */}
        <Box mt={1} sx={{ 
          p: 1, 
          border: '1px solid', 
          borderColor: theme.palette.divider,
          borderRadius: 1,
          textAlign: 'center'
        }}>
          <Typography variant="caption" color="text.secondary">
            License Status
          </Typography>
          <Typography variant="body2" fontWeight="medium">
            {getLicenseStatusText(license)}
          </Typography>
        </Box>

        {/* Upgrade prompt for trial users */}
        {license?.status === 'trial' && (
          <Button
            variant="outlined"
            size="small"
            fullWidth
            color="primary"
            sx={{ mt: 1 }}
            onClick={async () => {
              const freeTrialPriceId = 'price_1RZ7YYDFOqrH8dpSjXL6A25g'; // $0.00 Free Trial

              if (!user || !user.id) {
                console.error('User ID is not available. Cannot proceed with upgrade.');
                alert('Error: User information is missing. Please try logging out and back in.');
                return;
              }

              try {
                console.log(`Attempting to create Stripe checkout session for Price ID: ${freeTrialPriceId}, User ID: ${user.id}`);
                const result = await window.electronAPI.stripe.createCheckoutSession(freeTrialPriceId, user.id);
                if (result && result.success && result.url) {
                  console.log('Stripe checkout session created, opening URL:', result.url);
                  window.electronAPI.system.openExternal(result.url);
                } else {
                  console.error('Failed to create Stripe checkout session:', result?.error);
                  alert(`Could not initiate upgrade: ${result?.error || 'Unknown error'}`);
                }
              } catch (error) {
                console.error('Error during Stripe checkout process:', error);
                alert('An unexpected error occurred while trying to upgrade.');
              }
            }}
          >
            Upgrade Plan
          </Button>
        )}
      </Box>

      <Divider />

      {/* Navigation Menu */}
      <Box sx={{ flexGrow: 1 }}>
        <List sx={{ px: 1 }}>
          {menuItems.map((item) => (
            <ListItem key={item.path} disablePadding sx={{ mb: 0.5 }}>
              <ListItemButton
                onClick={() => navigate(item.path)}
                selected={location.pathname === item.path}
                sx={{
                  borderRadius: 2,
                  '&.Mui-selected': {
                    backgroundColor: theme.palette.primary.main,
                    color: 'white',
                    '&:hover': {
                      backgroundColor: theme.palette.primary.dark,
                    },
                  },
                }}
              >
                <ListItemText 
                  primary={item.text}
                  secondary={
                    location.pathname === item.path ? null : (
                      <Typography variant="caption" color="text.secondary">
                        {item.description}
                      </Typography>
                    )
                  }
                />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Box>

      {/* Quick Status */}
      <Box sx={{ p: 2 }}>
        <Typography variant="caption" color="text.secondary" gutterBottom display="block">
          System Status
        </Typography>
        <Box mb={1} sx={{ 
          p: 1, 
          border: '1px solid', 
          borderColor: isGoogleConnected ? 'success.main' : 'error.main',
          borderRadius: 1,
          backgroundColor: isGoogleConnected ? 'success.light' : 'error.light',
          opacity: 0.8
        }}>
          <Typography variant="caption" fontWeight="medium">
            Google: {isGoogleConnected ? 'Connected' : 'Disconnected'}
          </Typography>
        </Box>
        <Box sx={{ 
          p: 1, 
          border: '1px solid', 
          borderColor: (mcpLaunchStatus === 'active' && claudeDetectionStatus === 'detected') ? 'success.main' : 'error.main',
          borderRadius: 1,
          backgroundColor: (mcpLaunchStatus === 'active' && claudeDetectionStatus === 'detected') ? 'success.light' : 'error.light',
          opacity: 0.8
        }}>
          <Typography variant="caption" fontWeight="medium">
            Claude: {(mcpLaunchStatus === 'active' && claudeDetectionStatus === 'detected') ? 'Ready'
              : mcpLaunchStatus === 'starting' ? 'Starting...'
              : mcpLaunchStatus === 'failed' ? 'Failed'
              : claudeDetectionStatus === 'detected' ? 'Detected'
              : claudeDetectionStatus === 'checking' || claudeDetectionStatus === 'unknown' ? 'Checking...'
              : 'Not Found'}
          </Typography>
        </Box>
      </Box>

      <Divider />

      {/* Logout */}
      <Box sx={{ p: 1 }}>
        <Button
          onClick={onLogout}
          variant="outlined"
          color="error"
          fullWidth
          sx={{
            textTransform: 'none',
            borderRadius: 2,
          }}
        >
          Sign Out
        </Button>
      </Box>
    </Drawer>
  );
};

export default Navigation; 