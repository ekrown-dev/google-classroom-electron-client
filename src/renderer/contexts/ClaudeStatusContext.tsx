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
  const [claudeDetectionStatus, setClaudeDetectionStatus] = useState<ClaudeDetectionStatus>('not_found');
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
      setClaudeDetectionStatus('not_found'); // Or 'unknown' if preferred on error
      setClaudeDetectionError(error.message || 'Failed to check Claude Desktop status.');
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
        // If claude:detect didn't run right before, or to refresh details
        // you might want to call checkClaudeDetection again or a more specific getClaudeStatus IPC
      } else {
        setMcpLaunchStatus('failed');
        setMcpLaunchError(result.error || 'Failed to launch MCP and Claude.');
      }
    } catch (error: any) {
      console.error('Error launching MCP and Claude:', error);
      setMcpLaunchStatus('failed');
      setMcpLaunchError(error.message || 'An unexpected error occurred during launch.');
    }
  }, [claudeDetectionStatus, checkClaudeDetection]);

  const stopMcpAndClaude = useCallback(async () => {
    try {
      setMcpLaunchStatus('starting'); // Use 'starting' as loading state for stop operation
      setMcpLaunchError(undefined);
      
      const result = await window.electronAPI.mcp.stop();
      
      if (result.success) {
        setMcpLaunchStatus('inactive');
      } else {
        setMcpLaunchStatus('failed');
        setMcpLaunchError(result.error || 'Failed to stop MCP and Claude');
      }
    } catch (error: any) {
      console.error('Error stopping MCP and Claude:', error);
      setMcpLaunchStatus('failed');
      setMcpLaunchError(error.message || 'An unexpected error occurred during stop');
    }
  }, []);

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
