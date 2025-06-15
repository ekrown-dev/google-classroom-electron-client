import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Tabs,
  Tab,
  Card,
  CardContent,
  TextField,
  Button,
  Alert,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Switch,
  FormControlLabel,
  Chip,
  Link,
  Paper,
  Grid
} from '@mui/material';
import {
  Key as KeyIcon,
  CreditCard as CreditCardIcon,
  Computer as ComputerIcon,
  Help as HelpIcon,
  CheckCircle as CheckIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Payment as PaymentIcon,
  AccountCircle as AccountCircleIcon
} from '@mui/icons-material';

interface SettingsProps {
  user: any;
  license: any;
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
      id={`settings-tabpanel-${index}`}
      aria-labelledby={`settings-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const Settings: React.FC<SettingsProps> = ({ user, license }) => {
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const [credentials, setCredentials] = useState({
    clientId: '',
    clientSecret: '',
    serviceAccountPath: ''
  });

  const [systemInfo, setSystemInfo] = useState<any>(null);
  const [settings, setSettings] = useState({
    autoStart: false,
    notifications: true,
    debugging: false
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const [credStatus, sysInfo, currentLicense] = await Promise.all([
        window.electronAPI.credentials.load(),
        window.electronAPI.system.getSystemInfo(),
        window.electronAPI.supabase.getLicenseStatus()
      ]);

      if (credStatus) {
        setCredentials({
          clientId: credStatus.clientId || '',
          clientSecret: credStatus.clientSecret || '',
          serviceAccountPath: credStatus.serviceAccountPath || ''
        });
      }
      setSystemInfo(sysInfo);
      setSettings({
        autoStart: false,
        notifications: true,
        debugging: false
      });
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
    setError(null);
    setSuccess(null);
  };

  const handleCredentialsSave = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await window.electronAPI.credentials.save(credentials);
      if (result.success) {
        setSuccess('Credentials saved and validated successfully!');
      } else {
        setError('Failed to save credentials. Please check your input.');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to save credentials');
    } finally {
      setLoading(false);
    }
  };

  const handleUpgradeToPro = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await window.electronAPI.stripe.createCheckoutSession('price_1RZ7XYDFOqrH8dpSyfxS0nWJ', user.id);
      if (result.success && result.url) {
        window.electronAPI.system.openExternal(result.url);
        setSuccess('Redirecting to Stripe for upgrade...');
      } else {
        setError(result.error || 'Failed to initiate upgrade. Please try again.');
      }
    } catch (err) {
      console.error('Upgrade error:', err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred during upgrade.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpgradeToEnterprise = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await window.electronAPI.stripe.createCheckoutSession('price_1RVF4xDFOqrH8dpSOPsfh7Syss', user.id);
      if (result.success && result.url) {
        window.electronAPI.system.openExternal(result.url);
        setSuccess('Redirecting to Stripe for Enterprise plan...');
      } else {
        setError(result.error || 'Failed to initiate Enterprise upgrade. Please try again.');
      }
    } catch (err) {
      console.error('Enterprise Upgrade error:', err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred during Enterprise upgrade.');
    } finally {
      setLoading(false);
    }
  };

  const handleSettingChange = async (setting: string, value: boolean) => {
    try {
      setSettings(prev => ({ ...prev, [setting]: value }));
      console.log(`Setting ${setting} changed to ${value}`);
    } catch (error) {
      console.error('Failed to update setting:', error);
    }
  };

  const getLicenseStatusIcon = () => {
    switch (license?.status) {
      case 'active': return <CheckIcon color="success" />;
      case 'trial': return <WarningIcon color="warning" />;
      default: return <ErrorIcon color="error" />;
    }
  };

  return (
    <Box p={3}>
      <Typography variant="h4" gutterBottom>
        Settings
      </Typography>
      
      <Paper elevation={3}>
        <Tabs value={activeTab} onChange={handleTabChange} aria-label="Settings tabs">
          <Tab label="Account" icon={<AccountCircleIcon />} iconPosition="start" />
          <Tab label="Google Credentials" icon={<KeyIcon />} iconPosition="start" />
          <Tab label="Subscription" icon={<PaymentIcon />} iconPosition="start" />
          <Tab label="Application" icon={<ComputerIcon />} iconPosition="start" />
          <Tab label="Help & About" icon={<HelpIcon />} iconPosition="start" />
        </Tabs>

        {error && <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ m: 2 }}>{success}</Alert>}

        <TabPanel value={activeTab} index={0}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Account Information</Typography>
              {user && (
                <>
                  <Typography variant="body1"><strong>Email:</strong> {user.email}</Typography>
                </>
              )}
              {!user && <Typography variant="body1">Not logged in.</Typography>}
            </CardContent>
          </Card>
        </TabPanel>
        
        <TabPanel value={activeTab} index={1}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Google API Credentials
              </Typography>
              <Typography variant="body2" color="textSecondary" gutterBottom>
                Configure your Google Client ID, Client Secret, and Service Account for Google Classroom integration.
                These credentials are required for the application to access your Google Classroom data.
              </Typography>
              <Divider sx={{ my: 2 }} />
              <TextField
                label="Google Client ID"
                fullWidth
                margin="normal"
                value={credentials.clientId}
                onChange={(e) => setCredentials({ ...credentials, clientId: e.target.value })}
                helperText="Your Google Cloud project's OAuth 2.0 Client ID."
              />
              <TextField
                label="Google Client Secret"
                fullWidth
                margin="normal"
                type="password"
                value={credentials.clientSecret}
                onChange={(e) => setCredentials({ ...credentials, clientSecret: e.target.value })}
                helperText="Your Google Cloud project's OAuth 2.0 Client Secret."
              />
              <Button 
                variant="outlined" 
                component="label"
                fullWidth
                sx={{my:1}}
              >
                Upload Service Account JSON
                <input 
                    type="file" 
                    hidden 
                    accept=".json"
                    onChange={async (e) => {
                        if (e.target.files && e.target.files[0]) {
                            const file = e.target.files[0];
                            const reader = new FileReader();
                            reader.onload = (event) => {
                                if (event.target?.result) {
                                    setCredentials({ ...credentials, serviceAccountPath: file.name });
                                    // Store the actual content in a different field if needed
                                    // You might want to store the content in a separate state variable
                                }
                            };
                            reader.readAsText(file);
                        }
                    }}
                />
              </Button>
              {credentials.serviceAccountPath && <Typography variant="caption">Selected: {credentials.serviceAccountPath}</Typography>}
               <Typography variant="caption" display="block" gutterBottom sx={{mt:1}}>
                The service account JSON key file is necessary for background tasks and administrative actions.
                You can download this from your Google Cloud Console under IAM & Admin {'>'} Service Accounts.
              </Typography>
              <Button
                variant="contained"
                color="primary"
                onClick={handleCredentialsSave}
                disabled={loading}
                sx={{ mt: 2 }}
              >
                {loading ? 'Saving...' : 'Save & Validate Credentials'}
              </Button>
            </CardContent>
          </Card>
        </TabPanel>

        <TabPanel value={activeTab} index={2}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Subscription & License</Typography>
              <Grid container spacing={2} alignItems="center">
                <Grid item>
                  <Typography variant="body1">
                    Current Plan: <strong>{license?.planName || 'Free/Trial'}</strong>
                  </Typography>
                </Grid>
                <Grid item>
                  {getLicenseStatusIcon()}
                </Grid>
              </Grid>
              <Typography variant="body2" color="textSecondary" gutterBottom>
                Status: {license?.status ? license.status.charAt(0).toUpperCase() + license.status.slice(1) : 'Unknown'}
                {license?.trialEndsAt && ` (Trial ends on: ${new Date(license.trialEndsAt).toLocaleDateString()})`}
              </Typography>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle1" gutterBottom>Manage Your Subscription</Typography>
              {license?.status !== 'active' || license?.planName !== 'Pro' && (
                 <Button 
                    variant="contained" 
                    color="primary" 
                    onClick={handleUpgradeToPro} 
                    disabled={loading || (license?.planName === 'Pro' && license?.status === 'active')}
                    sx={{ mr: 2 }}
                  >
                    {loading ? 'Processing...' : 'Upgrade to Pro Plan'}
                  </Button>
              )}
              {license?.status !== 'active' || license?.planName !== 'Enterprise' && (
                  <Button 
                    variant="outlined" 
                    color="secondary" 
                    onClick={handleUpgradeToEnterprise} 
                    disabled={loading || (license?.planName === 'Enterprise' && license?.status === 'active')}
                  >
                    {loading ? 'Processing...' : 'Upgrade to Enterprise Plan'}
                  </Button>
              )}
              <Typography variant="caption" display="block" gutterBottom sx={{mt:2}}>
                Need help with your subscription or have billing questions? 
                <Link href="#" onClick={() => window.electronAPI.system.openExternal('mailto:support@example.com')}> Contact Support</Link>.
              </Typography>
            </CardContent>
          </Card>
        </TabPanel>

        <TabPanel value={activeTab} index={3}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Application Behavior
              </Typography>
              <List>
                <ListItem>
                  <ListItemIcon><Switch checked={settings.autoStart} onChange={(e) => handleSettingChange('autoStart', e.target.checked)} /></ListItemIcon>
                  <ListItemText primary="Auto-start application" secondary="Launch the application when your computer starts." />
                </ListItem>
                <ListItem>
                  <ListItemIcon><Switch checked={settings.notifications} onChange={(e) => handleSettingChange('notifications', e.target.checked)} /></ListItemIcon>
                  <ListItemText primary="Enable Notifications" secondary="Receive desktop notifications for important events." />
                </ListItem>
                <ListItem>
                  <ListItemIcon><Switch checked={settings.debugging} onChange={(e) => handleSettingChange('debugging', e.target.checked)}/></ListItemIcon>
                  <ListItemText primary="Enable Debugging Mode" secondary="Logs additional information for troubleshooting. May impact performance." />
                </ListItem>
              </List>
               <Typography variant="caption" display="block" gutterBottom sx={{mt:1}}>
                Note: These settings are currently placeholders and will be fully implemented in a future update.
              </Typography>
            </CardContent>
          </Card>
        </TabPanel>

        <TabPanel value={activeTab} index={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Help & About</Typography>
              {systemInfo && (
                <>
                  <Typography variant="body1"><strong>Application Version:</strong> {systemInfo.appVersion}</Typography>
                  <Typography variant="body1"><strong>Electron Version:</strong> {systemInfo.electronVersion}</Typography>
                  <Typography variant="body1"><strong>Node.js Version:</strong> {systemInfo.nodeVersion}</Typography>
                  <Typography variant="body1"><strong>Platform:</strong> {systemInfo.platform}</Typography>
                  <Typography variant="body1"><strong>Architecture:</strong> {systemInfo.arch}</Typography>
                  <Typography variant="body1"><strong>Machine ID:</strong> {systemInfo.machineId}</Typography>
                </>
              )}
              <Divider sx={{ my: 2 }} />
              <Typography variant="body2" gutterBottom>
                For support, please visit our <Link href="#" onClick={() => window.electronAPI.system.openExternal('https://your-support-page.com')}>Support Page</Link> or 
                <Link href="#" onClick={() => window.electronAPI.system.openExternal('mailto:support@example.com')}> Email Us</Link>.
              </Typography>
              <Typography variant="caption" display="block" gutterBottom sx={{mt:1}}>
                © {new Date().getFullYear()} Your Company Name. All rights reserved.
              </Typography>
            </CardContent>
          </Card>
        </TabPanel>
      </Paper>
    </Box>
  );
};

export default Settings;
