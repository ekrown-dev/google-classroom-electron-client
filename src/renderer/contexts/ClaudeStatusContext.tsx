// File: src/renderer/contexts/ClaudeStatusContext.tsx
import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';

interface ClaudeDetection {
  isInstalled: boolean;
  version?: string;
  installPath?: string;
  error?: string;
}

interface McpLaunchResponse {
  success: boolean;
  error?: string;
  // Add other fields if your mcp:launch returns more
}

type ClaudeDetectionStatus = 'unknown' | 'detected' | 'not_found' | 'checking';
type McpStatus = 'inactive' | 'starting' | 'active' | 'failed';


interface ClaudeStatusContextType {
  claudeDetectionStatus: ClaudeDetectionStatus;
  claudeInstallPath?: string;
  claudeVersion?: string;
  claudeDetectionError?: string;
  mcpLaunchStatus: McpStatus;
  mcpLaunchError?: string;
  checkClaudeDetection: () => Promise<void>;
  launchMcpAndClaude: () => Promise<void>;
  stopMcpAndClaude: () => Promise<void>; // Assuming mcp:stop exists
}

const ClaudeStatusContext = createContext<ClaudeStatusContextType | undefined>(undefined);

export const ClaudeStatusProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [claudeDetectionStatus, setClaudeDetectionStatus] = useState<ClaudeDetectionStatus>('unknown');
  const [claudeInstallPath, setClaudeInstallPath] = useState<string | undefined>(undefined);
  const [claudeVersion, setClaudeVersion] = useState<string | undefined>(undefined);
  const [claudeDetectionError, setClaudeDetectionError] = useState<string | undefined>(undefined);

  const [mcpLaunchStatus, setMcpLaunchStatus] = useState<McpStatus>('inactive');
  const [mcpLaunchError, setMcpLaunchError] = useState<string | undefined>(undefined);

  const checkClaudeDetection = useCallback(async () => {
    setClaudeDetectionStatus('checking');
    setClaudeDetectionError(undefined);
    try {
      const result: ClaudeDetection = await window.electronAPI.claude.detect();
      if (result.isInstalled) {
        setClaudeDetectionStatus('detected');
        setClaudeInstallPath(result.installPath);
        setClaudeVersion(result.version);
      } else {
        setClaudeDetectionStatus('not_found');
        setClaudeDetectionError(result.error || 'Claude Desktop not found.');
      }
    } catch (error: any) {
      console.error('Error detecting Claude Desktop:', error);
      setClaudeDetectionStatus('not_found');
      setClaudeDetectionError(error.message || 'Failed to check Claude Desktop status.');
    }
  }, []);

  const checkMcpStatus = useCallback(async () => {
    try {
      const result = await window.electronAPI.mcp.getStatus();
      if (result.isRunning) {
        setMcpLaunchStatus('active');
        setMcpLaunchError(undefined);
      } else {
        setMcpLaunchStatus('inactive');
      }
    } catch (error: any) {
      console.error('Error checking MCP status:', error);
      setMcpLaunchStatus('failed');
      setMcpLaunchError(error.message || 'Failed to check MCP status');
    }
  }, []);

  const launchMcpAndClaude = useCallback(async () => {
    setMcpLaunchStatus('starting');
    setMcpLaunchError(undefined);
    try {
      // Optionally re-check detection if not already detected or if a long time has passed
      if (claudeDetectionStatus !== 'detected') {
        await checkClaudeDetection(); // Ensure we have latest detection info
        // If still not detected after re-check, handle error appropriately
        const currentDetectionResult = await window.electronAPI.claude.detect();
        if (!currentDetectionResult.isInstalled) {
            setMcpLaunchStatus('failed');
            setMcpLaunchError('Cannot launch: Claude Desktop is not detected.');
            return;
        }
      }

      const result: McpLaunchResponse = await window.electronAPI.mcp.launch();
      if (result.success) {
        setMcpLaunchStatus('active');
        // Re-check Claude detection to update status
        await checkClaudeDetection();
        // Start periodic status checking
        setTimeout(checkMcpStatus, 2000);
      } else {
        setMcpLaunchStatus('failed');
        setMcpLaunchError(result.error || 'Failed to launch MCP and Claude.');
      }
    } catch (error: any) {
      console.error('Error launching MCP and Claude:', error);
      setMcpLaunchStatus('failed');
      setMcpLaunchError(error.message || 'An unexpected error occurred during launch.');
    }
  }, [claudeDetectionStatus, checkClaudeDetection, checkMcpStatus]);

  const stopMcpAndClaude = useCallback(async () => {
    try {
      setMcpLaunchStatus('starting'); // Use 'starting' as loading state for stop operation
      setMcpLaunchError(undefined);
      
      const result = await window.electronAPI.mcp.stop();
      
      if (result.success) {
        setMcpLaunchStatus('inactive');
        // Re-check status after stopping
        setTimeout(checkMcpStatus, 1000);
      } else {
        setMcpLaunchStatus('failed');
        setMcpLaunchError(result.error || 'Failed to stop MCP and Claude');
      }
    } catch (error: any) {
      console.error('Error stopping MCP and Claude:', error);
      setMcpLaunchStatus('failed');
      setMcpLaunchError(error.message || 'An unexpected error occurred during stop');
    }
  }, [checkMcpStatus]);

  // Initial detection on mount
  useEffect(() => {
    checkClaudeDetection();
    checkMcpStatus();
  }, [checkClaudeDetection, checkMcpStatus]);

  // Periodic status checking when active
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (mcpLaunchStatus === 'active') {
      interval = setInterval(() => {
        checkMcpStatus();
      }, 10000); // Check every 10 seconds when active
    }
    
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [mcpLaunchStatus, checkMcpStatus]);

  const value = {
    claudeDetectionStatus,
    claudeInstallPath,
    claudeVersion,
    claudeDetectionError,
    mcpLaunchStatus,
    mcpLaunchError,
    checkClaudeDetection,
    launchMcpAndClaude,
    stopMcpAndClaude,
  };

  return <ClaudeStatusContext.Provider value={value}>{children}</ClaudeStatusContext.Provider>;
};

export const useClaudeStatus = (): ClaudeStatusContextType => {
  const context = useContext(ClaudeStatusContext);
  if (context === undefined) {
    throw new Error('useClaudeStatus must be used within a ClaudeStatusProvider');
  }
  return context;
};
