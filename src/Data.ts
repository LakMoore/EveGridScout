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

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  category: string;
  action: string;
  outcome: "success" | "failure";
  actorId?: string;
  guildId?: string;
  details?: Record<string, unknown>;
}

export interface GuildConfig {
  guildId: string;
  viewerRoleId?: string;
  eventChannelId?: string;
  enabledEvents?: string[];
  intelConfig?: GuildIntelConfig;
  updatedBy?: string;
  updatedAt: string;
}

export interface GuildIntelConfig {
  singleSystemName?: string;
  nullSecPocketName?: string;
  nullSecSystems?: string[];
}

export interface SpyFlagEntry {
  userId: string;
  guildIds: string[];
  reason: string;
  firstDetectedAt: string;
  lastDetectedAt: string;
  source: "ingest" | "dashboard";
  attempts: number;
}

export class Data {
  //singleton
  private static instance: Data;
  private static ERROR_LOGS: ErrorLogEntry[];
  private static AUDIT_LOGS: AuditLogEntry[];
  private static GUILD_CONFIGS: Record<string, GuildConfig>;
  private static SPY_FLAGS: Record<string, SpyFlagEntry>;
  private static readonly MAX_ERROR_LOGS = 1000; // Maximum number of error logs to keep
  private static readonly MAX_AUDIT_LOGS = 2000;
  private static readonly ERROR_LOG_KEY = "error_logs";
  private static readonly AUDIT_LOG_KEY = "audit_logs";
  private static readonly GUILD_CONFIGS_KEY = "guild_configs";
  private static readonly SPY_FLAGS_KEY = "spy_flags_v1";

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
    Data.AUDIT_LOGS = await this.getAuditLogs();
    Data.GUILD_CONFIGS = await this.getGuildConfigs();
    Data.SPY_FLAGS = await this.getSpyFlags();
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
    } catch (error) {
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
      } else {
        return Data.ERROR_LOGS.slice(offset, offset + limit);
      }
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
      console.error("Failed to clear error logs:", error);
      return false;
    }
  }

  /**
   * Writes one audit log entry.
   */
  public async logAudit(entry: {
    category: string;
    action: string;
    outcome: "success" | "failure";
    actorId?: string;
    guildId?: string;
    details?: Record<string, unknown>;
  }) {
    try {
      const auditEntry: AuditLogEntry = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2),
        timestamp: new Date().toISOString(),
        category: entry.category,
        action: entry.action,
        outcome: entry.outcome,
        actorId: entry.actorId,
        guildId: entry.guildId,
        details: entry.details,
      };

      Data.AUDIT_LOGS.unshift(auditEntry);
      if (Data.AUDIT_LOGS.length > Data.MAX_AUDIT_LOGS) {
        Data.AUDIT_LOGS.length = Data.MAX_AUDIT_LOGS;
      }

      await storage.setItem(Data.AUDIT_LOG_KEY, Data.AUDIT_LOGS);
      return auditEntry.id;
    } catch (error) {
      console.error("Failed to log audit entry:", error);
      return null;
    }
  }

  /**
   * Retrieves paginated audit logs.
   */
  public async getAuditLogs(
    limit: number = 200,
    offset: number = 0,
  ): Promise<AuditLogEntry[]> {
    try {
      if (!Data.AUDIT_LOGS) {
        Data.AUDIT_LOGS = (await storage.getItem(
          Data.AUDIT_LOG_KEY,
        )) as AuditLogEntry[];
      }
      if (!Array.isArray(Data.AUDIT_LOGS)) {
        await this.clearAuditLogs();
      } else {
        return Data.AUDIT_LOGS.slice(offset, offset + limit);
      }
    } catch (error) {
      console.error("Failed to get audit logs:", error);
    }
    return [];
  }

  /**
   * Clears all audit logs.
   */
  public async clearAuditLogs(): Promise<boolean> {
    try {
      Data.AUDIT_LOGS = [];
      await storage.setItem(Data.AUDIT_LOG_KEY, Data.AUDIT_LOGS);
      return true;
    } catch (error) {
      console.error("Failed to clear audit logs:", error);
      return false;
    }
  }

  /**
   * Gets all guild configs.
   */
  public async getGuildConfigs(): Promise<Record<string, GuildConfig>> {
    try {
      if (!Data.GUILD_CONFIGS) {
        const existing = await storage.getItem(Data.GUILD_CONFIGS_KEY);
        if (!existing || typeof existing !== "object") {
          Data.GUILD_CONFIGS = {};
        } else {
          Data.GUILD_CONFIGS = existing as Record<string, GuildConfig>;
        }
      }

      return Data.GUILD_CONFIGS;
    } catch (error) {
      console.error("Failed to get guild configs:", error);
      return {};
    }
  }

  /**
   * Gets guild config by guild ID.
   */
  public async getGuildConfig(guildId: string): Promise<GuildConfig | null> {
    const configs = await this.getGuildConfigs();
    return configs[guildId] ?? null;
  }

  /**
   * Sets or updates the viewer role for a guild.
   */
  public async setGuildViewerRole(
    guildId: string,
    viewerRoleId: string,
    updatedBy?: string,
  ): Promise<GuildConfig> {
    const configs = await this.getGuildConfigs();
    const existing = configs[guildId];

    const updated: GuildConfig = {
      guildId,
      viewerRoleId,
      eventChannelId: existing?.eventChannelId,
      enabledEvents: existing?.enabledEvents ?? [],
      intelConfig: existing?.intelConfig,
      updatedBy,
      updatedAt: new Date().toISOString(),
    };

    configs[guildId] = updated;
    Data.GUILD_CONFIGS = configs;
    await storage.setItem(Data.GUILD_CONFIGS_KEY, configs);

    return updated;
  }

  /**
   * Sets or updates the event channel for a guild.
   */
  public async setGuildEventChannel(
    guildId: string,
    eventChannelId: string,
    updatedBy?: string,
  ): Promise<GuildConfig> {
    const configs = await this.getGuildConfigs();
    const existing = configs[guildId];

    const updated: GuildConfig = {
      guildId,
      viewerRoleId: existing?.viewerRoleId,
      eventChannelId,
      enabledEvents: existing?.enabledEvents ?? [],
      intelConfig: existing?.intelConfig,
      updatedBy,
      updatedAt: new Date().toISOString(),
    };

    configs[guildId] = updated;
    Data.GUILD_CONFIGS = configs;
    await storage.setItem(Data.GUILD_CONFIGS_KEY, configs);

    return updated;
  }

  /**
   * Enables one event type for a guild.
   */
  public async enableGuildEvent(
    guildId: string,
    eventType: string,
    updatedBy?: string,
  ): Promise<GuildConfig> {
    const configs = await this.getGuildConfigs();
    const existing = configs[guildId];
    const enabledEvents = new Set(existing?.enabledEvents ?? []);
    enabledEvents.add(eventType);

    const updated: GuildConfig = {
      guildId,
      viewerRoleId: existing?.viewerRoleId,
      eventChannelId: existing?.eventChannelId,
      enabledEvents: Array.from(enabledEvents),
      intelConfig: existing?.intelConfig,
      updatedBy,
      updatedAt: new Date().toISOString(),
    };

    configs[guildId] = updated;
    Data.GUILD_CONFIGS = configs;
    await storage.setItem(Data.GUILD_CONFIGS_KEY, configs);

    return updated;
  }

  /**
   * Disables one event type for a guild.
   */
  public async disableGuildEvent(
    guildId: string,
    eventType: string,
    updatedBy?: string,
  ): Promise<GuildConfig> {
    const configs = await this.getGuildConfigs();
    const existing = configs[guildId];
    const enabledEvents = (existing?.enabledEvents ?? []).filter(
      (e) => e !== eventType,
    );

    const updated: GuildConfig = {
      guildId,
      viewerRoleId: existing?.viewerRoleId,
      eventChannelId: existing?.eventChannelId,
      enabledEvents,
      intelConfig: existing?.intelConfig,
      updatedBy,
      updatedAt: new Date().toISOString(),
    };

    configs[guildId] = updated;
    Data.GUILD_CONFIGS = configs;
    await storage.setItem(Data.GUILD_CONFIGS_KEY, configs);

    return updated;
  }

  /**
   * Sets or updates guild intel-scoping configuration.
   */
  public async setGuildIntelConfig(
    guildId: string,
    intelConfig: GuildIntelConfig,
    updatedBy?: string,
  ): Promise<GuildConfig> {
    const configs = await this.getGuildConfigs();
    const existing = configs[guildId];

    const normalizedNullSecSystems = (intelConfig.nullSecSystems ?? [])
      .map((system) => system.trim())
      .filter((system) => system.length > 0);

    const updated: GuildConfig = {
      guildId,
      viewerRoleId: existing?.viewerRoleId,
      eventChannelId: existing?.eventChannelId,
      enabledEvents: existing?.enabledEvents ?? [],
      intelConfig: {
        singleSystemName: intelConfig.singleSystemName?.trim() || undefined,
        nullSecPocketName: intelConfig.nullSecPocketName?.trim() || undefined,
        nullSecSystems: normalizedNullSecSystems,
      },
      updatedBy,
      updatedAt: new Date().toISOString(),
    };

    configs[guildId] = updated;
    Data.GUILD_CONFIGS = configs;
    await storage.setItem(Data.GUILD_CONFIGS_KEY, configs);

    return updated;
  }

  public async getSpyFlags(): Promise<Record<string, SpyFlagEntry>> {
    try {
      if (!Data.SPY_FLAGS) {
        const existing = await storage.getItem(Data.SPY_FLAGS_KEY);
        if (!existing || typeof existing !== "object") {
          Data.SPY_FLAGS = {};
        } else {
          Data.SPY_FLAGS = existing as Record<string, SpyFlagEntry>;
        }
      }

      return Data.SPY_FLAGS;
    } catch (error) {
      console.error("Failed to get spy flags:", error);
      return {};
    }
  }

  public async getSpyFlag(userId: string): Promise<SpyFlagEntry | null> {
    const spyFlags = await this.getSpyFlags();
    return spyFlags[userId] ?? null;
  }

  public async recordSpyFlag(entry: {
    userId: string;
    guildIds: string[];
    reason: string;
    source: "ingest" | "dashboard";
  }): Promise<SpyFlagEntry> {
    const spyFlags = await this.getSpyFlags();
    const existing = spyFlags[entry.userId];
    const nowIso = new Date().toISOString();

    const mergedGuildIds = Array.from(
      new Set([...(existing?.guildIds ?? []), ...entry.guildIds]),
    );

    const updated: SpyFlagEntry = {
      userId: entry.userId,
      guildIds: mergedGuildIds,
      reason: entry.reason,
      source: entry.source,
      firstDetectedAt: existing?.firstDetectedAt ?? nowIso,
      lastDetectedAt: nowIso,
      attempts: (existing?.attempts ?? 0) + 1,
    };

    spyFlags[entry.userId] = updated;
    Data.SPY_FLAGS = spyFlags;
    await storage.setItem(Data.SPY_FLAGS_KEY, spyFlags);
    return updated;
  }
}
