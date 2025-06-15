import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';
import log from 'electron-log';

interface ClaudeDetectionResult {
  isInstalled: boolean;
  version?: string;
  installPath?: string;
  isPaidVersion?: boolean;
  error?: string;
}

interface ClaudeValidationResult {
  isValid: boolean;
  version?: string;
  isPaidVersion?: boolean;
  canLaunch?: boolean;
  error?: string;
}

interface InstallInstructions {
  platform: string;
  downloadUrl: string;
  instructions: string[];
  notes: string[];
}

export class ClaudeDetectionService {
  private static readonly CLAUDE_PATHS = {
    win32: [
      'C:\\Users\\%USERNAME%\\AppData\\Local\\Programs\\Claude\\Claude.exe',
      'C:\\Program Files\\Claude\\Claude.exe',
      'C:\\Program Files (x86)\\Claude\\Claude.exe'
    ],
    darwin: [
      '/Applications/Claude.app',
      '/Users/%USERNAME%/Applications/Claude.app'
    ],
    linux: [
      '/usr/bin/claude-desktop',
      '/opt/claude/claude',
      '/usr/local/bin/claude',
      '/usr/local/bin/claude-desktop',
      '/home/%USERNAME%/.local/share/applications/claude-desktop.desktop',
      '/usr/share/applications/claude-desktop.desktop'
    ]
  };

  private static readonly DOWNLOAD_URLS = {
    win32: 'https://claude.ai/download/windows',
    darwin: 'https://claude.ai/download/mac',
    linux: 'https://claude.ai/download/linux'
  };

  async detectClaudeDesktop(): Promise<ClaudeDetectionResult> {
    try {
      const platform = process.platform as keyof typeof ClaudeDetectionService.CLAUDE_PATHS;
      const possiblePaths = ClaudeDetectionService.CLAUDE_PATHS[platform] || [];

      log.info(`Detecting Claude Desktop on ${platform}`);

      for (const pathTemplate of possiblePaths) {
        const currentPathToTest = this.resolvePath(pathTemplate);
        const isDesktopFile = currentPathToTest.endsWith('.desktop');
        let executablePath = currentPathToTest; // Assume currentPathToTest is executable unless it's a .desktop file

        try {
          if (isDesktopFile && platform === 'linux') {
            log.info(`Found potential .desktop file: ${currentPathToTest}`);
            const actualExecutable = await this.extractExecutableFromDesktopFile(currentPathToTest);
            if (actualExecutable) {
              if (!(await this.pathExists(actualExecutable))) {
                log.warn(`Executable ${actualExecutable} from .desktop file ${currentPathToTest} does not exist. Skipping.`);
                continue;
              }
              executablePath = actualExecutable; // This is the real executable
              log.info(`Using executable ${executablePath} from .desktop file ${currentPathToTest}`);
            } else {
              log.warn(`Could not extract executable from .desktop file ${currentPathToTest}. Skipping.`);
              continue; // Skip if .desktop file is invalid or Exec line missing
            }
          } else {
            // If not a Linux .desktop file, check existence of currentPathToTest directly
            if (!(await this.pathExists(currentPathToTest))) {
              continue; // Path doesn't exist
            }
            // executablePath is already currentPathToTest
          }

          // At this point, executablePath should be a valid, existing executable path
          log.info(`Confirmed executable/application exists at: ${executablePath}`);
          
          const version = await this.getClaudeVersion(executablePath, platform); // Pass executablePath and platform
          const isPaidVersion = await this.checkIfPaidVersion();
            
          return {
            isInstalled: true,
            installPath: executablePath, // Return the *actual executable path*
            version,
            isPaidVersion
          };

        } catch (error) {
          log.debug(`Path check or version retrieval failed for ${currentPathToTest} (derived executable: ${executablePath}):`, error);
          continue;
        }
      }

      log.warn('Claude Desktop not found in any expected locations or derived executable paths');
      return {
        isInstalled: false,
        error: 'Claude Desktop not found in expected installation directories'
      };
    } catch (error: any) {
      log.error('Error detecting Claude Desktop:', error);
      return {
        isInstalled: false,
        error: error.message
      };
    }
  }

  async validateClaudeVersion(): Promise<ClaudeValidationResult> {
    try {
      const detection = await this.detectClaudeDesktop();
      
      if (!detection.isInstalled) {
        return {
          isValid: false,
          error: 'Claude Desktop is not installed'
        };
      }

      const canLaunch = await this.testClaudeLaunch(detection.installPath!);
      
      return {
        isValid: detection.isInstalled && canLaunch,
        version: detection.version,
        isPaidVersion: detection.isPaidVersion,
        canLaunch,
        error: canLaunch ? undefined : 'Claude Desktop cannot be launched'
      };
    } catch (error: any) {
      log.error('Error validating Claude version:', error);
      return {
        isValid: false,
        error: error.message
      };
    }
  }

  getInstallInstructions(): InstallInstructions {
    const platform = process.platform;
    const downloadUrl = ClaudeDetectionService.DOWNLOAD_URLS[platform as keyof typeof ClaudeDetectionService.DOWNLOAD_URLS] || 'https://claude.ai/download';

    const instructions: { [key: string]: InstallInstructions } = {
      win32: {
        platform: 'Windows',
        downloadUrl,
        instructions: [
          'Visit the Claude Desktop download page',
          'Click "Download for Windows"',
          'Run the downloaded installer (.exe file)',
          'Follow the installation wizard',
          'Launch Claude Desktop and sign in with your Anthropic account',
          'Verify you have a paid Claude subscription (Pro or Team)'
        ],
        notes: [
          'Claude Desktop requires Windows 10 or later',
          'You need an active Claude Pro or Team subscription to use MCP features',
          'The free tier does not support Model Context Protocol (MCP)'
        ]
      },
      darwin: {
        platform: 'macOS',
        downloadUrl,
        instructions: [
          'Visit the Claude Desktop download page',
          'Click "Download for Mac"',
          'Open the downloaded .dmg file',
          'Drag Claude.app to your Applications folder',
          'Launch Claude from Applications and sign in',
          'Verify you have a paid Claude subscription (Pro or Team)'
        ],
        notes: [
          'Claude Desktop requires macOS 10.15 (Catalina) or later',
          'You may need to allow the app in System Preferences > Security & Privacy',
          'MCP features require a paid Claude subscription'
        ]
      },
      linux: {
        platform: 'Linux',
        downloadUrl,
        instructions: [
          'Visit the Claude Desktop download page',
          'Download the appropriate package for your distribution (.deb, .rpm, or .AppImage)',
          'Install using your package manager or run the AppImage directly',
          'Launch Claude Desktop and sign in',
          'Verify you have a paid Claude subscription (Pro or Team)'
        ],
        notes: [
          'Claude Desktop supports major Linux distributions',
          'For Ubuntu/Debian: sudo dpkg -i claude-desktop.deb',
          'For Fedora/RHEL: sudo rpm -i claude-desktop.rpm',
          'AppImage requires execute permissions: chmod +x Claude.AppImage'
        ]
      }
    };

    return instructions[platform] || instructions.win32;
  }

  private resolvePath(pathTemplate: string): string {
    // Replace %USERNAME% placeholder with actual username
    const username = process.env.USERNAME || process.env.USER || 'user';
    return pathTemplate.replace(/%USERNAME%/g, username);
  }

  private async pathExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async extractExecutableFromDesktopFile(desktopFilePath: string): Promise<string | null> {
    try {
      const desktopFileContent = await fs.readFile(desktopFilePath, 'utf8');
      const execLineMatch = desktopFileContent.match(/^Exec=([^\s%]+)/m);
      if (execLineMatch && execLineMatch[1]) {
        return execLineMatch[1];
      }
      log.warn(`Could not find Exec line in ${desktopFilePath}`);
      return null;
    } catch (fileError) {
      log.warn(`Error reading or parsing .desktop file ${desktopFilePath}:`, fileError);
      return null;
    }
  }

  private async getClaudeVersion(executablePath: string, platform: string): Promise<string | undefined> {
    try {
      if (platform === 'darwin') {
        const plistPath = path.join(executablePath, 'Contents', 'Info.plist');
        if (await this.pathExists(plistPath)) {
          const plistContent = await fs.readFile(plistPath, 'utf8');
          const versionMatch = plistContent.match(/<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/);
          if (versionMatch) return versionMatch[1];
        }
      } else if (platform === 'win32') {
        return await this.getWindowsExeVersion(executablePath);
      } else if (platform === 'linux') {
        return await this.getLinuxVersionInternal(executablePath);
      }
    } catch (error) {
      log.debug(`Could not determine Claude version for ${executablePath}:`, error);
    }
    return undefined;
  }

  private async getWindowsExeVersion(exePath: string): Promise<string | undefined> {
    return new Promise((resolve) => {
      try {
        const process = spawn('powershell', [
          '-Command',
          `(Get-ItemProperty '${exePath}').VersionInfo.FileVersion`
        ]);

        let output = '';
        process.stdout.on('data', (data) => {
          output += data.toString();
        });

        process.on('close', (code) => {
          if (code === 0 && output.trim()) {
            resolve(output.trim());
          } else {
            resolve(undefined);
          }
        });

        process.on('error', () => {
          resolve(undefined);
        });
      } catch {
        resolve(undefined);
      }
    });
  }

  private async getLinuxVersionInternal(executablePath: string): Promise<string | undefined> {
    log.info(`getLinuxVersionInternal: Starting for executable ${executablePath}`);
    return new Promise((resolve) => {
      log.info(`getLinuxVersionInternal: Attempting to spawn ${executablePath} --version`);
      const process = spawn(executablePath, ['--version']);
      let output = '';
      let errorOutput = '';
      let settled = false;

      const TIMEOUT_DURATION = 7000; // 7 seconds

      const timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        log.warn(`getLinuxVersionInternal: Timeout after ${TIMEOUT_DURATION}ms for ${executablePath} --version`);
        if (process.kill()) {
          log.info(`getLinuxVersionInternal: Process for ${executablePath} --version killed due to timeout.`);
        } else {
          log.warn(`getLinuxVersionInternal: Process for ${executablePath} --version could not be killed or already exited on timeout.`);
        }
        resolve(undefined);
      }, TIMEOUT_DURATION);

      process.stdout.on('data', (data) => { output += data.toString(); });
      process.stderr.on('data', (data) => { errorOutput += data.toString(); });

      process.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        log.info(`getLinuxVersionInternal: ${executablePath} --version closed with code ${code}. Output: "${output.trim()}", Error: "${errorOutput.trim()}"`);
        if (code === 0 && output.trim().match(/\d+\.\d+\.\d+/)) {
          resolve(output.trim().match(/(\d+\.\d+\.\d+)/)![1]);
        } else {
          resolve(undefined);
        }
      });

      process.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        log.error(`getLinuxVersionInternal: Error spawning ${executablePath} --version:`, err);
        resolve(undefined);
      });
    });
  }

  private async checkIfPaidVersion(): Promise<boolean> {
    try {
      // Check for MCP configuration capability as an indicator of paid version
      // Paid versions (Pro/Team) support MCP, free versions don't
      const mcpValidation = await this.validateMCPConfiguration();
      
      // If there's a config file that can be written to, it's likely a paid version
      // Free versions typically don't have MCP configuration files
      if (mcpValidation.configPath) {
        log.info(`Found Claude Desktop config at ${mcpValidation.configPath} - indicating paid version capability`);
        return true;
      }
      
      // Also check if the config directory exists (even without a config file)
      // This suggests the app has been initialized with MCP capabilities
      const configDir = await this.getClaudeConfigDirectory();
      if (configDir && await this.pathExists(configDir)) {
        log.info(`Found Claude Desktop config directory at ${configDir} - indicating paid version capability`);
        return true;
      }
      
      // As a fallback, we'll be conservative and assume free version
      // Better to show upgrade prompt to free users than block paid users
      log.warn('Could not determine Claude Desktop subscription status - assuming free version');
      return false;
    } catch (error) {
      log.error('Error checking Claude version type:', error);
      return false;
    }
  }
  
  private async getClaudeConfigDirectory(): Promise<string | null> {
    try {
      const platform = process.platform;
      const username = process.env.USERNAME || process.env.USER || 'user';
      
      const configDirs = {
        win32: `C:\\Users\\${username}\\AppData\\Roaming\\Claude`,
        darwin: `/Users/${username}/Library/Application Support/Claude`,
        linux: `/home/${username}/.config/Claude`
      };

      return configDirs[platform as keyof typeof configDirs] || null;
    } catch {
      return null;
    }
  }

  private async testClaudeLaunch(claudePath: string): Promise<boolean> {
    return new Promise((resolve) => {
      log.info(`testClaudeLaunch: Attempting to launch ${claudePath} for platform ${process.platform}`);
      let resolvedForLinuxOnSpawn = false; // Flag to track if resolved for Linux on spawn
      try {
        const platform = process.platform;
        let command: string = claudePath;
        let args: string[] = [];

        if (platform === 'darwin') {
          command = 'open';
          args = ['-a', claudePath];
        } else if (platform === 'win32') {
          args = ['--version']; 
        } else if (platform === 'linux') { 
          log.info(`testClaudeLaunch: For Linux, attempting basic spawn of ${command} with no args.`);
          // No arguments for Linux, just basic spawn test
        } else {
          log.warn(`testClaudeLaunch: Unknown platform ${platform}, attempting direct execution.`);
        }

        const childProcess = spawn(command, args);
        let output = '';
        let errorOutput = '';

        childProcess.stdout.on('data', (data) => { output += data.toString(); });
        childProcess.stderr.on('data', (data) => { errorOutput += data.toString(); });

        const TIMEOUT_DURATION = 7000; 

        const timeout = setTimeout(() => {
          log.warn(`testClaudeLaunch: Timeout after ${TIMEOUT_DURATION}ms for ${command} ${args.join(' ')}`);
          if (!resolvedForLinuxOnSpawn) { // Only kill if not already handled by Linux spawn success
            if (childProcess.kill()) {
              log.info('testClaudeLaunch: Process killed due to timeout.');
            } else {
              log.warn('testClaudeLaunch: Process could not be killed or already exited on timeout.');
            }
          }
          if (!resolvedForLinuxOnSpawn) resolve(false); // Don't resolve if Linux already did
        }, TIMEOUT_DURATION);

        childProcess.on('spawn', () => {
          log.info(`testClaudeLaunch: Successfully spawned ${command} ${args.join(' ')}.`);
          if (platform === 'linux') {
            clearTimeout(timeout); 
            log.info('testClaudeLaunch: Linux spawn successful, resolving true and killing process.');
            if (childProcess.kill()) {
              log.info('testClaudeLaunch: Linux process killed after successful spawn test.');
            } else {
               log.warn('testClaudeLaunch: Linux process on spawn could not be killed or already exited.');
            }
            resolvedForLinuxOnSpawn = true;
            resolve(true); 
          } else {
            log.info('testClaudeLaunch: Spawned for non-Linux, waiting for close event.');
            // For other platforms, we wait for the 'close' event to check exit codes/output
          }
        });

        childProcess.on('error', (err) => {
          clearTimeout(timeout);
          if (!resolvedForLinuxOnSpawn) { // Prevent resolving twice if Linux spawn already succeeded
            log.error(`testClaudeLaunch: Error spawning ${command} ${args.join(' ')}:`, err);
            resolve(false);
          }
        });

        childProcess.on('close', (code) => {
          clearTimeout(timeout);
          if (resolvedForLinuxOnSpawn) return; // Already handled for Linux

          log.info(`testClaudeLaunch: ${command} ${args.join(' ')} closed with code ${code}. stdout: "${output.trim()}", stderr: "${errorOutput.trim()}"`);

          if (platform === 'win32') {
            if (code === 0 && output.trim().match(/\d+\.\d+\.\d+/)) {
              log.info('testClaudeLaunch: Windows success based on exit code 0 and version output.');
              resolve(true);
            } else {
              log.warn('testClaudeLaunch: Windows failed. Non-zero exit code or no version string.');
              resolve(false);
            }
          } else if (platform === 'darwin') {
            if (code === 0) {
              log.info('testClaudeLaunch: macOS success based on exit code 0 from open command.');
              resolve(true);
            } else {
              log.warn('testClaudeLaunch: macOS failed. Non-zero exit code.');
              resolve(false);
            }
          } else {
            // This case should ideally not be hit if Linux resolves on spawn, 
            // or if other platforms are correctly handled.
            log.warn(`testClaudeLaunch: Unhandled case or unexpected close event for platform ${platform}. Exit code: ${code}.`);
            resolve(false);
          }
        });
      } catch (error) {
        log.error(`testClaudeLaunch: General catch block error:`, error);
        if (!resolvedForLinuxOnSpawn) resolve(false); // Ensure resolution if error occurs before any event
      }
    });
  }

  async getClaudeConfigPath(): Promise<string | null> {
    try {
      const platform = process.platform;
      const username = process.env.USERNAME || process.env.USER || 'user';
      
      const configPaths = {
        win32: `C:\\Users\\${username}\\AppData\\Roaming\\Claude\\claude_desktop_config.json`,
        darwin: `/Users/${username}/Library/Application Support/Claude/claude_desktop_config.json`,
        linux: `/home/${username}/.config/Claude/claude_desktop_config.json`
      };

      const configPath = configPaths[platform as keyof typeof configPaths];
      
      if (configPath && await this.pathExists(configPath)) {
        return configPath;
      }
      
      return null;
    } catch {
      return null;
    }
  }

  async validateMCPConfiguration(): Promise<{ isConfigured: boolean; configPath?: string; error?: string }> {
    try {
      const configPath = await this.getClaudeConfigPath();
      
      if (!configPath) {
        return {
          isConfigured: false,
          error: 'Claude Desktop configuration file not found'
        };
      }

      const configContent = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(configContent);
      
      // Check if MCP servers are configured
      const hasMCPServers = config.mcpServers && Object.keys(config.mcpServers).length > 0;
      
      return {
        isConfigured: hasMCPServers,
        configPath,
        error: hasMCPServers ? undefined : 'No MCP servers configured in Claude Desktop'
      };
    } catch (error: any) {
      return {
        isConfigured: false,
        error: error.message
      };
    }
  }
} 