import { Client } from "discord.js";
import { Data, GuildConfig } from "./Data.js";
import { Grid } from "./Grid.js";
import { GridPilot } from "./LocalReport.js";
import { GridScoutEventType } from "./GuildEvents.js";
import { ScoutEntry } from "./ScoutEntry.js";
import { ScoutMessage } from "./ScoutMessage.js";

interface ParsedReportContext {
  guildId: string;
  message: ScoutMessage;
  pilots: ScoutEntry[];
}

/**
 * Dispatches GridScout notification events to configured Discord destinations.
 */
export class NotificationService {
  private static instance: NotificationService;

  private readonly client: Client;
  private readonly scoutLoginNoticeByScout = new Map<string, number>();
  private readonly enemySightingNoticeByKey = new Map<string, number>();
  private readonly onGridThreatNoticeBySystem = new Map<string, number>();
  private readonly allScoutsLoggedOffNoticeSentGuilds = new Set<string>();

  private readonly scoutLoginCooldownMs = 5 * 60 * 1000;
  private readonly enemySightingCooldownMs = 10 * 60 * 1000;
  private readonly onGridThreatCooldownMs = 2 * 60 * 1000;

  public static getInstance(client: Client): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService(client);
    }
    return NotificationService.instance;
  }

  private constructor(client: Client) {
    this.client = client;
  }

  public async processParsedReport(context: ParsedReportContext) {
    this.trimExpiredDedupeEntries();
    await this.handleScoutCoverageEvents(context.guildId, context.message);
    await this.handleEnemySightings(
      context.guildId,
      context.message,
      context.pilots,
    );
    await this.handleScoutDecloaked(context.guildId, context.message);
  }

  public async notifySpyBehavior(
    guildIds: string[],
    reporterDiscordUserId: string,
    reason: string,
  ) {
    const dedupedGuildIds = Array.from(new Set(guildIds.filter(Boolean)));
    if (dedupedGuildIds.length === 0) {
      return;
    }

    for (const guildId of dedupedGuildIds) {
      const content = `🚫 **Possible spy behavior detected** for <@${reporterDiscordUserId}> (${reporterDiscordUserId}). ${reason}`;
      const sentToEventChannel = await this.publishContentToGuildEventChannel(
        guildId,
        content,
      );
      if (sentToEventChannel) {
        continue;
      }

      await this.publishContentToGuildOwner(guildId, content);
    }
  }

  public async notifyUndockedLocalWarning(
    guildId: string,
    scoutDiscordUserId: string,
    scoutName: string,
    system: string,
    newPilotCount: number,
  ) {
    if (!guildId || !scoutDiscordUserId || newPilotCount <= 0) {
      return;
    }

    const pluralSuffix = newPilotCount === 1 ? "" : "s";
    const normalizedSystem = system?.trim() || "Unknown System";
    const normalizedScoutName = scoutName?.trim() || "Unknown Scout";
    const content = `⚠️ **Non-friendlies in local:** <@${scoutDiscordUserId}> (${normalizedScoutName}) is undocked in **${normalizedSystem}**. ${newPilotCount} new non-friendly pilot${pluralSuffix} entered local.`;

    const sentToEventChannel = await this.publishContentToGuildEventChannel(
      guildId,
      content,
    );
    if (sentToEventChannel) {
      return;
    }

    await this.publishContentToGuildOwner(guildId, content);
  }

  public async notifyOnGridThreat(
    guildId: string,
    system: string,
    scoutName: string,
    status: string,
    onGrid: GridPilot[],
  ) {
    if (!guildId || !Array.isArray(onGrid) || onGrid.length === 0) {
      return;
    }

    const now = Date.now();
    const normalizedSystem = system?.trim() || "Unknown System";
    const dedupeKey = `${guildId}|${normalizedSystem.toLowerCase()}|${status.toLowerCase()}`;
    const lastNoticeAt = this.onGridThreatNoticeBySystem.get(dedupeKey) ?? 0;

    if (now - lastNoticeAt < this.onGridThreatCooldownMs) {
      return;
    }

    this.onGridThreatNoticeBySystem.set(dedupeKey, now);

    const normalizedScoutName = scoutName?.trim() || "Unknown Scout";
    const normalizedStatus = status?.trim() || "Unknown Status";

    const onGridLines = onGrid
      .map((pilot) => {
        const pilotName = pilot.PilotName?.trim() || "Unknown Pilot";
        const shipType = pilot.ShipType?.trim() || "Unknown Ship";
        const action = pilot.Action?.trim() || "Unknown";
        const corp = pilot.Corporation?.trim() || "";
        const alliance = pilot.Alliance?.trim() || "";
        const distance = pilot.Distance?.trim() || "";

        const orgParts: string[] = [];
        if (alliance) {
          orgParts.push(alliance);
        }
        if (corp && corp !== alliance) {
          orgParts.push(corp);
        }
        const orgText = orgParts.length > 0 ? ` [${orgParts.join("/")}]` : "";
        const distanceText = distance ? ` @ ${distance}` : "";

        return `- ${pilotName}${orgText} — ${shipType} (${action})${distanceText}`;
      })
      .join("\n");

    const content = `@here 🚨 **${normalizedStatus}** in **${normalizedSystem}** (Scout: ${normalizedScoutName}).\nOn-grid pilots:\n${onGridLines}`;

    const sentToEventChannel = await this.publishContentToGuildEventChannel(
      guildId,
      content,
    );
    if (sentToEventChannel) {
      return;
    }

    await this.publishContentToGuildOwner(guildId, content);
  }

  private async handleScoutCoverageEvents(
    guildId: string,
    message: ScoutMessage,
  ) {
    const scoutReports = Grid.getInstance
      ? (await Grid.getInstance()).getScoutReports(guildId)
      : new Map();

    const onlineScouts = Array.from(scoutReports.values()).filter(
      (scout) => scout.wormhole !== "Lost Connection",
    );

    if (
      !message.Disconnected &&
      this.isScoutOnline(message.Scout, scoutReports)
    ) {
      const lastNoticeAt = this.scoutLoginNoticeByScout.get(message.Scout) ?? 0;
      const now = Date.now();
      if (now - lastNoticeAt >= this.scoutLoginCooldownMs) {
        this.scoutLoginNoticeByScout.set(message.Scout, now);
        await this.publishEventToChannels(
          "new_scout_logged_in",
          guildId,
          `🛰️ **New scout logged in:** ${message.Scout} is now active in ${message.System || "Unknown System"}.`,
        );
      }
    }

    if (onlineScouts.length === 0) {
      if (!this.allScoutsLoggedOffNoticeSentGuilds.has(guildId)) {
        this.allScoutsLoggedOffNoticeSentGuilds.add(guildId);
        await this.publishEventToChannels(
          "all_scouts_logged_off",
          guildId,
          "⚠️ **All scouts logged off.** GridScout currently has no active coverage.",
        );
      }
    } else {
      this.allScoutsLoggedOffNoticeSentGuilds.delete(guildId);
    }
  }

  private async handleEnemySightings(
    guildId: string,
    message: ScoutMessage,
    pilots: ScoutEntry[],
  ) {
    const now = Date.now();

    for (const pilot of pilots) {
      const pilotName = pilot.Name?.trim() ?? "";
      const shipName = pilot.Type?.trim() ?? "";
      if (!pilotName || !shipName) {
        continue;
      }

      const sightingKey = [
        pilotName.toLowerCase(),
        shipName.toLowerCase(),
        (message.System ?? "").toLowerCase(),
        (message.Wormhole ?? "").toLowerCase(),
      ].join("|");

      const lastNoticeAt = this.enemySightingNoticeByKey.get(sightingKey) ?? 0;
      if (now - lastNoticeAt < this.enemySightingCooldownMs) {
        continue;
      }

      this.enemySightingNoticeByKey.set(sightingKey, now);
      await this.publishEventToChannels(
        "new_enemy_sighted",
        guildId,
        `🚨 **New enemy sighted:** ${pilotName} in ${shipName} at ${message.Wormhole || "Unknown Wormhole"} (${message.System || "Unknown System"}).`,
      );
    }
  }

  private async handleScoutDecloaked(guildId: string, message: ScoutMessage) {
    if (!/decloak/i.test(message.Message ?? "")) {
      return;
    }

    const scoutName = message.Scout || "Unknown Scout";
    const scoutDiscordId = message.ReporterDiscordUserId?.trim() ?? "";

    if (/^\d{17,20}$/.test(scoutDiscordId)) {
      try {
        const scoutUser = await this.withDiscordRetry(
          () => this.client.users.fetch(scoutDiscordId),
          `user_fetch:${scoutDiscordId}`,
        );
        await scoutUser.send(
          `⚠️ **Scout decloaked:** ${scoutName} appears decloaked in ${message.System || "Unknown System"}.`,
        );
        return;
      } catch (error) {
        console.error("Failed to DM scout decloak notification:", error);
      }
    }

    await this.publishEventToChannels(
      "scout_decloaked",
      guildId,
      `⚠️ **Scout decloaked:** ${scoutName} appears decloaked.`,
    );
  }

  private isScoutOnline(
    scoutName: string,
    scoutReports: Map<string, { wormhole: string }>,
  ) {
    const scout = scoutReports.get(scoutName);
    if (!scout) {
      return false;
    }

    return scout.wormhole !== "Lost Connection";
  }

  private async publishEventToChannels(
    eventType: GridScoutEventType,
    guildId: string,
    content: string,
  ) {
    const targetGuildConfigs = await this.getTargetGuildConfigs(
      eventType,
      guildId,
    );

    for (const guildConfig of targetGuildConfigs) {
      const eventChannelId = guildConfig.eventChannelId;
      if (!eventChannelId) {
        continue;
      }

      try {
        const channel = await this.withDiscordRetry(
          () => this.client.channels.fetch(eventChannelId),
          `channel_fetch:${eventChannelId}`,
        );
        if (!channel || !("send" in channel)) {
          continue;
        }

        const sendChannel = channel as {
          send?: (value: { content: string }) => Promise<unknown>;
        };
        if (typeof sendChannel.send !== "function") {
          continue;
        }

        await this.withDiscordRetry(
          () => sendChannel.send!({ content }),
          `channel_send:${eventChannelId}`,
        );
      } catch (error) {
        console.error(
          `Failed to publish ${eventType} to channel ${eventChannelId}:`,
          error,
        );
      }
    }
  }

  private async getTargetGuildConfigs(
    eventType: GridScoutEventType,
    guildId: string,
  ): Promise<GuildConfig[]> {
    const guildConfig = await Data.getInstance().getGuildConfig(guildId);
    if (!guildConfig?.eventChannelId) {
      return [];
    }

    const enabledEvents = guildConfig.enabledEvents ?? [];
    if (!enabledEvents.includes(eventType)) {
      return [];
    }

    return [guildConfig];
  }

  private trimExpiredDedupeEntries() {
    const now = Date.now();
    for (const [
      scoutName,
      timestamp,
    ] of this.scoutLoginNoticeByScout.entries()) {
      if (now - timestamp > this.scoutLoginCooldownMs * 2) {
        this.scoutLoginNoticeByScout.delete(scoutName);
      }
    }

    for (const [
      sightingKey,
      timestamp,
    ] of this.enemySightingNoticeByKey.entries()) {
      if (now - timestamp > this.enemySightingCooldownMs * 2) {
        this.enemySightingNoticeByKey.delete(sightingKey);
      }
    }

    for (const [
      systemKey,
      timestamp,
    ] of this.onGridThreatNoticeBySystem.entries()) {
      if (now - timestamp > this.onGridThreatCooldownMs * 2) {
        this.onGridThreatNoticeBySystem.delete(systemKey);
      }
    }
  }

  private async publishContentToGuildEventChannel(
    guildId: string,
    content: string,
  ): Promise<boolean> {
    const guildConfig = await Data.getInstance().getGuildConfig(guildId);
    const eventChannelId = guildConfig?.eventChannelId;
    if (!eventChannelId) {
      return false;
    }

    try {
      const channel = await this.withDiscordRetry(
        () => this.client.channels.fetch(eventChannelId),
        `channel_fetch:${eventChannelId}`,
      );
      if (!channel || !("send" in channel)) {
        return false;
      }

      const sendChannel = channel as {
        send?: (value: { content: string }) => Promise<unknown>;
      };
      if (typeof sendChannel.send !== "function") {
        return false;
      }

      await this.withDiscordRetry(
        () => sendChannel.send!({ content }),
        `channel_send:${eventChannelId}`,
      );
      return true;
    } catch (error) {
      console.error(
        `Failed to send message to event channel ${eventChannelId}:`,
        error,
      );
      return false;
    }
  }

  private async publishContentToGuildOwner(guildId: string, content: string) {
    try {
      const guild = await this.withDiscordRetry(
        () => this.client.guilds.fetch(guildId),
        `guild_fetch:${guildId}`,
      );
      const owner = await this.withDiscordRetry(
        () => guild.fetchOwner(),
        `guild_owner_fetch:${guildId}`,
      );
      await this.withDiscordRetry(
        () => owner.send(content),
        `guild_owner_dm_send:${guildId}`,
      );
    } catch (error) {
      console.error(`Failed to DM guild owner for ${guildId}:`, error);
    }
  }

  private async withDiscordRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
  ): Promise<T> {
    const maxAttempts = 3;
    const baseDelayMs = 200;
    let attempt = 0;
    let lastError: unknown;

    while (attempt < maxAttempts) {
      attempt += 1;
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (attempt >= maxAttempts || !this.isRetryableDiscordError(error)) {
          break;
        }

        const backoffMs =
          baseDelayMs * 2 ** (attempt - 1) + Math.floor(Math.random() * 75);
        await this.sleep(backoffMs);
      }
    }

    throw new Error(
      `Discord operation failed after retries (${operationName}): ${String(lastError)}`,
    );
  }

  private isRetryableDiscordError(error: unknown): boolean {
    if (!error || typeof error !== "object") {
      return false;
    }

    const maybeStatus = (error as { status?: unknown }).status;
    if (typeof maybeStatus === "number") {
      if (maybeStatus >= 500) {
        return true;
      }
      if (maybeStatus === 429 || maybeStatus === 408) {
        return true;
      }
      return false;
    }

    const maybeCode = (error as { code?: unknown }).code;
    const retryableCodes = new Set([
      "ECONNRESET",
      "ECONNREFUSED",
      "ETIMEDOUT",
      "EAI_AGAIN",
      "UND_ERR_CONNECT_TIMEOUT",
      "UND_ERR_HEADERS_TIMEOUT",
    ]);

    return typeof maybeCode === "string" && retryableCodes.has(maybeCode);
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
