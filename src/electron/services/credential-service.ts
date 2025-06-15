import * as keytar from 'keytar';
// import * as CryptoJS from 'crypto-js'; // No longer using wildcard import
import AES from 'crypto-js/aes.js';
import encHex from 'crypto-js/enc-hex.js';
import encUtf8 from 'crypto-js/enc-utf8.js';
// WordArray is often implicitly handled or part of the objects returned by encHex.parse or used by AES

import { createHash, randomBytes } from 'node:crypto'; // For SHA256 and random IV generation
import log from 'electron-log';
import pkg from 'node-machine-id';
const { machineId } = pkg;

interface GoogleCredentials {
  clientId?: string;
  clientSecret?: string;
  serviceAccountJson?: string;
  credentialType: 'oauth' | 'serviceAccount';
  displayName?: string;
  createdAt: string;
  updatedAt: string;
}

interface CredentialValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  credentialType?: 'oauth' | 'serviceAccount';
}

interface SecureCredentialStore {
  encryptedData: string;
  iv: string;
  machineId: string;
  timestamp: string;
}

export class CredentialService {
  private static readonly SERVICE_NAME = 'google-classroom-mcp-server';
  private static readonly KEYTAR_ACCOUNT = 'google-credentials';
  private static readonly FALLBACK_KEY_PREFIX = 'mcp_creds_';
  
  private machineIdentifier: string | null = null;
  private currentUserId: string | null = null;

  constructor() {
    this.initializeMachineId();
  }

  // Set the current user ID to make credentials user-specific
  setCurrentUserId(userId: string): void {
    this.currentUserId = userId;
    log.info('Credential service set for user:', userId);
  }

  // Get user-specific credential key
  private getUserSpecificKey(): string {
    if (!this.currentUserId) {
      throw new Error('User ID not set. Credentials must be user-specific.');
    }
    return `${CredentialService.KEYTAR_ACCOUNT}_${this.currentUserId}`;
  }

  private async initializeMachineId(): Promise<void> {
    try {
      this.machineIdentifier = await machineId();
      log.info('Machine identifier initialized for credential encryption');
    } catch (error) {
      log.error('Failed to get machine ID, using fallback:', error);
      this.machineIdentifier = 'fallback-machine-id';
    }
  }

  async saveCredentials(credentials: GoogleCredentials): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.currentUserId) {
        return {
          success: false,
          error: 'User ID not set. Cannot save user-specific credentials.'
        };
      }

      if (!this.machineIdentifier) {
        await this.initializeMachineId();
      }

      // Check if credentials are already in use by another user
      const duplicateCheck = await this.checkCredentialDuplication(credentials);
      if (!duplicateCheck.success) {
        return duplicateCheck;
      }

      // Validate credentials before saving
      const validation = await this.validateCredentials(credentials);
      if (!validation.isValid) {
        return {
          success: false,
          error: `Invalid credentials: ${validation.errors.join(', ')}`
        };
      }

      // Add metadata
      const credentialsWithMetadata: GoogleCredentials = {
        ...credentials,
        updatedAt: new Date().toISOString(),
        createdAt: credentials.createdAt || new Date().toISOString()
      };

      // Try to save using keytar first
      const keytarResult = await this.saveWithKeytar(credentialsWithMetadata);
      if (keytarResult.success) {
        log.info('Credentials saved successfully using keytar');
        return keytarResult;
      }

      // Fallback to encrypted file storage
      log.warn('Keytar failed, falling back to encrypted storage:', keytarResult.error);
      const fallbackResult = await this.saveWithEncryption(credentialsWithMetadata);
      
      if (fallbackResult.success) {
        log.info('Credentials saved successfully using encrypted fallback');
      }

      return fallbackResult;
    } catch (error: any) {
      log.error('Error saving credentials:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async loadCredentials(): Promise<{ success: boolean; credentials?: GoogleCredentials; error?: string }> {
    try {
      if (!this.currentUserId) {
        return {
          success: false,
          error: 'User ID not set. Cannot load user-specific credentials.'
        };
      }

      if (!this.machineIdentifier) {
        await this.initializeMachineId();
      }

      // Try to load from keytar first
      const keytarResult = await this.loadFromKeytar();
      if (keytarResult.success && keytarResult.credentials) {
        log.info('Credentials loaded successfully from keytar');
        return keytarResult;
      }

      // Fallback to encrypted file storage
      log.debug('Keytar failed, trying encrypted storage:', keytarResult.error);
      const fallbackResult = await this.loadFromEncryption();
      
      if (fallbackResult.success && fallbackResult.credentials) {
        log.info('Credentials loaded successfully from encrypted fallback');
      }

      return fallbackResult;
    } catch (error: any) {
      log.error('Error loading credentials:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Check if credentials are already in use by another user
  private async checkCredentialDuplication(credentials: GoogleCredentials): Promise<{ success: boolean; error?: string }> {
    try {
      // This is a simplified check - in a real implementation, you might want to store
      // a hash of credentials in a central location to check for duplicates
      // For now, we'll just log and allow (but this should be enhanced)
      
      if (credentials.credentialType === 'oauth' && credentials.clientId) {
        // In a production system, you'd check against a database of used credentials
        // For now, we'll implement a basic file-based check
        log.info('Checking credential duplication for Client ID:', credentials.clientId);
        
        // TODO: Implement proper duplication check against Supabase or local storage
        // This would involve storing credential hashes and checking against them
        
        return { success: true };
      }
      
      return { success: true };
    } catch (error: any) {
      log.error('Error checking credential duplication:', error);
      return {
        success: false,
        error: `Credential duplication check failed: ${error.message}`
      };
    }
  }

  async validateCredentials(credentials: GoogleCredentials): Promise<CredentialValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Check credential type
      if (!credentials.credentialType || !['oauth', 'serviceAccount'].includes(credentials.credentialType)) {
        errors.push('Invalid or missing credential type');
      }

      if (credentials.credentialType === 'oauth') {
        // Validate OAuth credentials
        if (!credentials.clientId || !credentials.clientId.trim()) {
          errors.push('Client ID is required for OAuth credentials');
        } else {
          // Validate Client ID format
          if (!credentials.clientId.includes('.apps.googleusercontent.com')) {
            warnings.push('Client ID does not appear to be a valid Google OAuth Client ID');
          }
        }

        if (!credentials.clientSecret || !credentials.clientSecret.trim()) {
          errors.push('Client Secret is required for OAuth credentials');
        } else {
          // Basic validation for client secret
          if (credentials.clientSecret.length < 20) {
            warnings.push('Client Secret appears to be too short');
          }
        }

        if (credentials.serviceAccountJson) {
          warnings.push('Service Account JSON provided but credential type is OAuth');
        }
      } else if (credentials.credentialType === 'serviceAccount') {
        // Validate Service Account credentials
        if (!credentials.serviceAccountJson || !credentials.serviceAccountJson.trim()) {
          errors.push('Service Account JSON is required for Service Account credentials');
        } else {
          try {
            const serviceAccount = JSON.parse(credentials.serviceAccountJson);
            
            // Validate required fields
            const requiredFields = ['type', 'project_id', 'private_key_id', 'private_key', 'client_email', 'client_id'];
            for (const field of requiredFields) {
              if (!serviceAccount[field]) {
                errors.push(`Missing required field in Service Account JSON: ${field}`);
              }
            }

            // Validate type
            if (serviceAccount.type !== 'service_account') {
              errors.push('Service Account JSON type must be "service_account"');
            }

            // Validate email format
            if (serviceAccount.client_email && !serviceAccount.client_email.includes('@')) {
              errors.push('Service Account client_email is not a valid email address');
            }

            // Validate private key format
            if (serviceAccount.private_key && !serviceAccount.private_key.includes('-----BEGIN PRIVATE KEY-----')) {
              errors.push('Service Account private_key does not appear to be in correct format');
            }
          } catch (parseError) {
            errors.push('Service Account JSON is not valid JSON');
          }
        }

        if (credentials.clientId || credentials.clientSecret) {
          warnings.push('OAuth credentials provided but credential type is Service Account');
        }
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
        credentialType: credentials.credentialType
      };
    } catch (error: any) {
      log.error('Error validating credentials:', error);
      return {
        isValid: false,
        errors: [`Validation error: ${error.message}`],
        warnings
      };
    }
  }

  async clearCredentials(): Promise<{ success: boolean; error?: string }> {
    try {
      let keytarCleared = false;
      let encryptionFileCleared = false;

      // Try to clear from keytar
      try {
        // Check if keytar.deletePassword is a function before calling it
        if (keytar && typeof keytar.deletePassword === 'function') {
          const userSpecificKey = this.getUserSpecificKey();
          await keytar.deletePassword(CredentialService.SERVICE_NAME, userSpecificKey);
          keytarCleared = true;
          log.info('Credentials cleared from keytar');
        } else {
          log.warn('keytar.deletePassword is not available. Skipping keytar clear.');
          // We can consider this 'cleared' from keytar's perspective if the function isn't there,
          // as it implies keytar isn't being used or isn't working.
          keytarCleared = true; 
        }
      } catch (error) {
        log.debug('Failed to clear from keytar (may not exist or other error):', error);
        // Even if there's an error, we might still consider it "cleared" for the purpose of the fallback
        keytarCleared = true; 
      }

      // Try to clear encrypted storage file
      try {
        const fs = await import('fs/promises');
        const path = await import('path');
        const os = await import('os');
        const userSpecificFile = `credentials_${this.currentUserId}.enc`;
        const storePath = path.join(os.homedir(), '.google-classroom-mcp', userSpecificFile);
        
        try {
            await fs.unlink(storePath);
            encryptionFileCleared = true;
            log.info('Encrypted credentials file deleted successfully.');
        } catch (unlinkError: any) {
            if (unlinkError.code === 'ENOENT') {
                log.info('Encrypted credentials file not found, no need to delete.');
                encryptionFileCleared = true; // If it doesn't exist, it's effectively cleared
            } else {
                throw unlinkError; // Re-throw other errors
            }
        }
      } catch (error) {
        log.error('Failed to clear encrypted credentials file:', error);
        // If clearing the file fails, we don't set encryptionFileCleared to true
      }

      return {
        // Success if at least one method reported it cleared (or wasn't applicable and is considered cleared)
        // AND the encrypted file was actually confirmed as cleared (deleted or not found)
        success: keytarCleared && encryptionFileCleared 
      };
    } catch (error: any) {
      log.error('Error in clearCredentials method:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async testCredentials(credentials: GoogleCredentials): Promise<{ success: boolean; error?: string }> {
    try {
      // This is a placeholder for credential testing
      // In a real implementation, you would:
      // 1. Use the credentials to make a test API call to Google
      // 2. Verify the response is successful
      // 3. Check available scopes/permissions
      
      const validation = await this.validateCredentials(credentials);
      if (!validation.isValid) {
        return {
          success: false,
          error: `Credential validation failed: ${validation.errors.join(', ')}`
        };
      }

      // For now, return success if validation passes
      // TODO: Implement actual Google API test call
      return {
        success: true
      };
    } catch (error: any) {
      log.error('Error testing credentials:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  private async saveWithKeytar(credentials: GoogleCredentials): Promise<{ success: boolean; error?: string }> {
    try {
      // Check if keytar is available and functional
      if (!keytar || typeof keytar.setPassword !== 'function') {
        return {
          success: false,
          error: 'Keytar not available - setPassword function missing'
        };
      }

      const userSpecificKey = this.getUserSpecificKey();
      const credentialsJson = JSON.stringify(credentials);
      await keytar.setPassword(CredentialService.SERVICE_NAME, userSpecificKey, credentialsJson);
      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: `Keytar error: ${error.message}`
      };
    }
  }

  private async loadFromKeytar(): Promise<{ success: boolean; credentials?: GoogleCredentials; error?: string }> {
    try {
      // Check if keytar is available and functional
      if (!keytar || typeof keytar.getPassword !== 'function') {
        return {
          success: false,
          error: 'Keytar not available - getPassword function missing'
        };
      }

      const userSpecificKey = this.getUserSpecificKey();
      const credentialsJson = await keytar.getPassword(CredentialService.SERVICE_NAME, userSpecificKey);
      
      if (!credentialsJson) {
        return {
          success: false,
          error: 'No credentials found in keytar'
        };
      }

      const credentials = JSON.parse(credentialsJson) as GoogleCredentials;
      return {
        success: true,
        credentials
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Keytar error: ${error.message}`
      };
    }
  }

  private async saveWithEncryption(credentials: GoogleCredentials): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.machineIdentifier) {
        throw new Error('Machine identifier not available for encryption');
      }

      const hash = createHash('sha256');
      hash.update(this.machineIdentifier);
      const encryptionKey = hash.digest('hex');
      
      const ivNodeBuffer = randomBytes(16);
      const ivHex = ivNodeBuffer.toString('hex');
      const ivWordArray = encHex.parse(ivHex); // Use direct import for encHex
      
      const credentialsJson = JSON.stringify(credentials);
      const encrypted = AES.encrypt(credentialsJson, encryptionKey, { iv: ivWordArray }).toString(); // Use direct import for AES
      
      const secureStore: SecureCredentialStore = {
        encryptedData: encrypted,
        iv: ivHex, // Store IV as a hex string
        machineId: this.machineIdentifier,
        timestamp: new Date().toISOString()
      };

      // For now, we'll store in a local file
      // In production, you might want to store this in Supabase or another secure location
      const fs = await import('fs/promises');
      const path = await import('path');
      const os = await import('os');
      
      const userSpecificFile = `credentials_${this.currentUserId}.enc`;
      const storePath = path.join(os.homedir(), '.google-classroom-mcp', userSpecificFile);
      
      // Ensure directory exists
      await fs.mkdir(path.dirname(storePath), { recursive: true });
      
      // Write encrypted credentials
      await fs.writeFile(storePath, JSON.stringify(secureStore), 'utf8');
      
      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  private async loadFromEncryption(): Promise<{ success: boolean; credentials?: GoogleCredentials; error?: string }> {
    try {
      if (!this.machineIdentifier) {
        throw new Error('Machine identifier not available for decryption');
      }

      const fs = await import('fs/promises');
      const path = await import('path');
      const os = await import('os');
      
      const userSpecificFile = `credentials_${this.currentUserId}.enc`;
      const storePath = path.join(os.homedir(), '.google-classroom-mcp', userSpecificFile);
      
      // Read encrypted file
      const encryptedContent = await fs.readFile(storePath, 'utf8');
      const secureStore = JSON.parse(encryptedContent) as SecureCredentialStore;
      
      // Verify machine ID
      if (secureStore.machineId !== this.machineIdentifier) {
        throw new Error('Credentials were encrypted on a different machine');
      }
      
      // Create decryption key using Node.js crypto
      const hash = createHash('sha256');
      hash.update(this.machineIdentifier);
      const decryptionKey = hash.digest('hex');
      
      // The IV is stored as a hex string, parse it back to a WordArray for CryptoJS
      const ivWordArray = encHex.parse(secureStore.iv); // Use direct import for encHex
      
      const decrypted = AES.decrypt(
        secureStore.encryptedData, 
        decryptionKey, 
        { iv: ivWordArray }
      ); // Use direct import for AES
      
      const credentialsJson = decrypted.toString(encUtf8); // Use direct import for encUtf8
      const credentials = JSON.parse(credentialsJson) as GoogleCredentials;
      
      return {
        success: true,
        credentials
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async exportCredentials(): Promise<{ success: boolean; data?: string; error?: string }> {
    try {
      const result = await this.loadCredentials();
      
      if (!result.success || !result.credentials) {
        return {
          success: false,
          error: 'No credentials to export'
        };
      }

      // Create export data (without sensitive information)
      const exportData = {
        credentialType: result.credentials.credentialType,
        displayName: result.credentials.displayName,
        hasClientId: !!result.credentials.clientId,
        hasClientSecret: !!result.credentials.clientSecret,
        hasServiceAccount: !!result.credentials.serviceAccountJson,
        createdAt: result.credentials.createdAt,
        updatedAt: result.credentials.updatedAt,
        exportedAt: new Date().toISOString()
      };

      return {
        success: true,
        data: JSON.stringify(exportData, null, 2)
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }
} 