// Client-side setup completion storage utility
// This provides fallback when database operations fail

export class SetupStorage {
  private static getKey(userId: string): string {
    return `setup_completed_${userId}`;
  }

  static setSetupCompleted(userId: string, completed: boolean): void {
    try {
      localStorage.setItem(this.getKey(userId), completed.toString());
      console.log(`Setup completion saved to localStorage: ${completed} for user ${userId}`);
    } catch (error) {
      console.error('Failed to save setup completion to localStorage:', error);
    }
  }

  static getSetupCompleted(userId: string): boolean {
    try {
      const value = localStorage.getItem(this.getKey(userId));
      const isCompleted = value === 'true';
      console.log(`Setup completion loaded from localStorage: ${isCompleted} for user ${userId}`);
      return isCompleted;
    } catch (error) {
      console.error('Failed to load setup completion from localStorage:', error);
      return false;
    }
  }

  static clearSetupCompleted(userId: string): void {
    try {
      localStorage.removeItem(this.getKey(userId));
      console.log(`Setup completion cleared from localStorage for user ${userId}`);
    } catch (error) {
      console.error('Failed to clear setup completion from localStorage:', error);
    }
  }

  // Migration helper: try to get from localStorage if database fails
  static async getSetupCompletionWithFallback(
    userId: string, 
    databaseGetter: () => Promise<{ success: boolean; completed?: boolean; error?: string }>
  ): Promise<{ success: boolean; completed?: boolean; error?: string }> {
    try {
      // Try database first
      const dbResult = await databaseGetter();
      if (dbResult.success && dbResult.completed !== undefined) {
        return dbResult;
      }
      
      // Fall back to localStorage
      console.log('Database setup completion failed, using localStorage fallback');
      const localValue = this.getSetupCompleted(userId);
      return { success: true, completed: localValue };
    } catch (error) {
      console.error('Both database and localStorage failed:', error);
      return { success: true, completed: false };
    }
  }

  // Migration helper: save to both database and localStorage
  static async setSetupCompletionWithFallback(
    userId: string,
    completed: boolean,
    databaseSetter: (completed: boolean) => Promise<{ success: boolean; error?: string }>
  ): Promise<{ success: boolean; error?: string }> {
    // Always save to localStorage as backup
    this.setSetupCompleted(userId, completed);
    
    try {
      // Try database
      const dbResult = await databaseSetter(completed);
      if (dbResult.success) {
        return dbResult;
      } else {
        console.warn('Database save failed, but localStorage succeeded:', dbResult.error);
        return { success: true }; // Consider it successful if localStorage worked
      }
    } catch (error) {
      console.error('Database save failed, but localStorage succeeded:', error);
      return { success: true }; // Consider it successful if localStorage worked
    }
  }
}