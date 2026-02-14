import storage from "node-persist";

export interface ErrorLogEntry {
  id: string;
  timestamp: string;
  ip?: string;
  userAgent?: string;
  error: any;
  path?: string;
  method?: string;
}

export class Data {
  //singleton
  private static instance: Data;
  private static ERROR_LOGS: ErrorLogEntry[];
  private static readonly MAX_ERROR_LOGS = 1000; // Maximum number of error logs to keep
  private static readonly ERROR_LOG_KEY = "error_logs";

  public static getInstance() {
    if (!this.instance) {
      this.instance = new Data();
    }
    return this.instance;
  }

  private constructor() {}

  public async initialise() {
    await storage.init();

    // Initialize error logs if they don't exist
    Data.ERROR_LOGS = await this.getErrorLogs();
  }

  public async saveData(key: string, value: any) {
    await storage.setItem(key, value);
  }

  public async getData(key: string) {
    return await storage.getItem(key);
  }

  /**
   * Logs an error with additional context
   */
  public async logError(
    error: any,
    context: {
      ip?: string;
      userAgent?: string;
      path?: string;
      method?: string;
    } = {},
  ) {
    try {
      const errorEntry: ErrorLogEntry = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2),
        timestamp: new Date().toISOString(),
        error,
        ...context,
      };

      Data.ERROR_LOGS.unshift(errorEntry);

      // Keep only the most recent logs
      if (Data.ERROR_LOGS.length > Data.MAX_ERROR_LOGS) {
        Data.ERROR_LOGS.length = Data.MAX_ERROR_LOGS;
      }

      await storage.setItem(Data.ERROR_LOG_KEY, Data.ERROR_LOGS);
      return errorEntry.id;
    }
    catch (error) {
      console.error("Failed to log error:", error);
      return null;
    }
  }

  /**
   * Retrieves paginated error logs
   */
  public async getErrorLogs(
    limit: number = 100,
    offset: number = 0,
  ): Promise<ErrorLogEntry[]> {
    try {
      if (!Data.ERROR_LOGS) {
        Data.ERROR_LOGS = (await storage.getItem(
          Data.ERROR_LOG_KEY,
        )) as ErrorLogEntry[];
      }
      if (!Array.isArray(Data.ERROR_LOGS)) {
        await this.clearErrorLogs();
      }
      else {
        return Data.ERROR_LOGS.slice(offset, offset + limit);
      }
    }
    catch (error) {
      console.error("Failed to get error logs:", error);
    }
    return [];
  }

  /**
   * Retrieves a specific error log by ID
   */
  public async getErrorLog(id: string): Promise<ErrorLogEntry | null> {
    try {
      const logs = await this.getErrorLogs(Data.MAX_ERROR_LOGS);
      return logs.find((log) => log.id === id) || null;
    }
    catch (error) {
      console.error("Failed to get error log:", error);
      return null;
    }
  }

  /**
   * Clears all error logs
   */
  public async clearErrorLogs(): Promise<boolean> {
    try {
      Data.ERROR_LOGS = [];
      await storage.setItem(Data.ERROR_LOG_KEY, Data.ERROR_LOGS);
      return true;
    }
    catch (error) {
      console.error("Failed to clear error logs:", error);
      return false;
    }
  }
}
