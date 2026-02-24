import { Data } from "./Data.js";
import { GridPilot, LocalPilot, LocalReport } from "./LocalReport.js";
import { PilotSighting } from "./PilotSighting.js";
import { ScoutEntry } from "./ScoutEntry.js";
import { ScoutMessage } from "./ScoutMessage.js";

export interface Scout {
  name: string;
  system: string;
  wormhole: string;
  wormholeClass: string;
  discordId: string;
  version: string;
  lastSeen: Date;
}

export class Grid {
  // singleton
  private static instance: Grid;
  private static readonly SCOUT_INTEL_STORE_KEY = "scout_intel_store_v2";
  private static readonly LOCAL_REPORT_STORE_KEY = "local_report_store_v2";
  private static readonly MAX_LOCAL_REPORTS = 5000;
  private static sightingsByGuild: Record<string, PilotSighting[]> = {};
  private static localReportsByGuild: Record<string, LocalReport[]> = {};
  private static scoutReportsByGuild = new Map<string, Map<string, Scout>>();

  public static async getInstance(): Promise<Grid> {
    if (!Grid.instance) {
      Grid.instance = new Grid();
      await Grid.instance.load();
    }
    return Grid.instance;
  }

  private async saveScoutIntel() {
    await Data.getInstance().saveData(Grid.SCOUT_INTEL_STORE_KEY, {
      sightingsByGuild: Grid.sightingsByGuild,
    });
  }

  private async saveLocalReports() {
    await Data.getInstance().saveData(Grid.LOCAL_REPORT_STORE_KEY, {
      localReportsByGuild: Grid.localReportsByGuild,
    });
  }

  public async load() {
    console.log("Loading per-guild scout/local intel stores...");

    const persistedScoutStore = await Data.getInstance().getData(
      Grid.SCOUT_INTEL_STORE_KEY,
    );
    if (
      persistedScoutStore &&
      typeof persistedScoutStore === "object" &&
      "sightingsByGuild" in persistedScoutStore
    ) {
      const persistedSightingsByGuild = (
        persistedScoutStore as { sightingsByGuild?: unknown }
      ).sightingsByGuild;
      Grid.sightingsByGuild = this.normalizeSightingsByGuild(
        persistedSightingsByGuild,
      );
    }

    const persistedLocalStore = await Data.getInstance().getData(
      Grid.LOCAL_REPORT_STORE_KEY,
    );
    if (
      persistedLocalStore &&
      typeof persistedLocalStore === "object" &&
      "localReportsByGuild" in persistedLocalStore
    ) {
      const persistedLocalReportsByGuild = (
        persistedLocalStore as {
          localReportsByGuild?: unknown;
        }
      ).localReportsByGuild;
      Grid.localReportsByGuild = this.normalizeLocalReportsByGuild(
        persistedLocalReportsByGuild,
      );
    }

    if (!Grid.sightingsByGuild || typeof Grid.sightingsByGuild !== "object") {
      Grid.sightingsByGuild = {};
    }

    if (
      !Grid.localReportsByGuild ||
      typeof Grid.localReportsByGuild !== "object"
    ) {
      Grid.localReportsByGuild = {};
    }

    // Intentionally do not migrate centralized legacy intel on this rollout.
    await this.saveScoutIntel();
    await this.saveLocalReports();
  }

  public seenSoFar(guildId: string) {
    return [...this.getSightingsForGuild(guildId)];
  }

  public localReportsSoFar(guildId: string) {
    return [...this.getLocalReportsForGuild(guildId)];
  }

  public getScoutReports(guildId: string) {
    const scoutReports = this.getScoutReportMapForGuild(guildId);

    // remove any reports older than 5 minutes
    const now = Date.now();
    const oldKeys = Array.from(scoutReports.keys()).filter(
      (key) => now - scoutReports.get(key)!.lastSeen.getTime() > 5 * 60 * 1000,
    );
    for (const key of oldKeys) {
      scoutReports.delete(key);
    }

    return scoutReports;
  }

  public scoutReport(guildId: string, scout: ScoutMessage) {
    const scoutReports = this.getScoutReportMapForGuild(guildId);
    let entry = scoutReports.get(scout.Scout);

    // if doesn't exist, make one
    if (!entry) {
      entry = {
        name: scout.Scout,
        system: scout.System,
        wormhole: scout.Wormhole,
        wormholeClass: "",
        discordId: scout.ReporterDiscordUserId ?? "",
        version: scout.Version,
        lastSeen: new Date(),
      };
      scoutReports.set(scout.Scout, entry);
    }

    // update the entry
    if (scout.Disconnected) {
      entry.wormhole = "Lost Connection";
    } else if (scout.Wormhole.length > 0) {
      entry.wormhole = scout.Wormhole;
    } else {
      entry.wormhole = "No Wormhole";
    }

    entry.system = scout.System;
    if (scout.ReporterDiscordUserId && scout.ReporterDiscordUserId.length > 0) {
      entry.discordId = scout.ReporterDiscordUserId;
    }
    entry.version = scout.Version;
    entry.lastSeen = new Date();
  }

  public async activation(
    guildId: string,
    scout: string,
    wormhole: string,
    system: string,
    scoutDiscordId?: string,
  ) {
    const key = `Activation/${scout}/${wormhole}/${Date.now()}`;
    const sightings = this.getSightingsForGuild(guildId);

    sightings.push({
      key,
      name: "Activation",
      ship: "",
      alliance: "",
      corp: "",
      wormhole: "",
      firstSeenOnGrid: Date.now(),
      lastSeenOnGrid: Date.now(),
      wormholeName: wormhole,
      scoutName: scout,
      scoutDiscordId: scoutDiscordId ?? "",
      system,
    });

    await this.saveScoutIntel();
  }

  public async seenOnGrid(
    guildId: string,
    entry: ScoutEntry,
    wormholeClass: string,
    scoutName: string,
    scoutDiscordId: string,
    wormholeCode: string,
    system: string,
  ) {
    const sightings = this.getSightingsForGuild(guildId);

    // We want to track this pilot in this ship
    var key = `${entry.Name}/${entry.Type}`;

    // get the most recent sighting of this pilot in this ship
    const recentSighting = sightings.findLast((p) => p.key === key);

    // if we don't have a recent sighting or it was on a different wormhole
    if (!recentSighting || recentSighting.wormhole !== wormholeCode) {
      // call this a new sighting!
      sightings.push({
        key,
        name: entry.Name ?? "",
        ship: entry.Type ?? "",
        alliance: entry.Alliance?.replaceAll("[", "").replaceAll("]", "") ?? "",
        corp: entry.Corporation?.replaceAll("[", "").replaceAll("]", "") ?? "",
        wormhole: wormholeClass,
        firstSeenOnGrid: Date.now(),
        lastSeenOnGrid: Date.now(),
        wormholeName: wormholeCode,
        scoutName: scoutName,
        scoutDiscordId,
        system,
      });
    } else {
      // seen this pilot at this location most recently
      recentSighting.lastSeenOnGrid = Date.now();
      recentSighting.scoutName = scoutName;
      recentSighting.scoutDiscordId = scoutDiscordId;
      recentSighting.system = system;
      // move it to the end of the list
      Grid.sightingsByGuild[guildId] = sightings.filter((p) => p.key !== key);
      Grid.sightingsByGuild[guildId].push(recentSighting);
    }
    await this.saveScoutIntel();
  }

  public async submitLocalReport(guildId: string, localReport: LocalReport) {
    const reports = this.getLocalReportsForGuild(guildId);

    reports.push({
      System: localReport.System || "Unknown",
      ScoutName: localReport.ScoutName || "Unknown",
      Status: localReport.Status || "Unknown",
      Time: Number.isFinite(localReport.Time) ? localReport.Time : Date.now(),
      Locals: Array.isArray(localReport.Locals) ? localReport.Locals : [],
      OnGrid: Array.isArray(localReport.OnGrid) ? localReport.OnGrid : [],
    });

    if (reports.length > Grid.MAX_LOCAL_REPORTS) {
      reports.splice(0, reports.length - Grid.MAX_LOCAL_REPORTS);
    }

    await this.saveLocalReports();
  }

  async delete(guildId: string, key: string) {
    const sightings = this.getSightingsForGuild(guildId);

    const startLength = sightings.length;
    Grid.sightingsByGuild[guildId] = sightings.filter((k) => k.key !== key);
    await this.saveScoutIntel();
    return startLength !== Grid.sightingsByGuild[guildId].length;
  }

  private getSightingsForGuild(guildId: string): PilotSighting[] {
    if (!Grid.sightingsByGuild[guildId]) {
      Grid.sightingsByGuild[guildId] = [];
    }

    return Grid.sightingsByGuild[guildId];
  }

  private getLocalReportsForGuild(guildId: string): LocalReport[] {
    if (!Grid.localReportsByGuild[guildId]) {
      Grid.localReportsByGuild[guildId] = [];
    }

    return Grid.localReportsByGuild[guildId];
  }

  private getScoutReportMapForGuild(guildId: string): Map<string, Scout> {
    let reportMap = Grid.scoutReportsByGuild.get(guildId);
    if (!reportMap) {
      reportMap = new Map<string, Scout>();
      Grid.scoutReportsByGuild.set(guildId, reportMap);
    }

    return reportMap;
  }

  // Normalizes persisted per-guild sightings into a strict guildId -> PilotSighting[] map.
  // Non-object inputs return an empty map, and each guild array is normalized item-by-item.
  private normalizeSightingsByGuild(
    sightingsByGuild: unknown,
  ): Record<string, PilotSighting[]> {
    const normalized: Record<string, PilotSighting[]> = {};
    if (!sightingsByGuild || typeof sightingsByGuild !== "object") {
      return normalized;
    }

    for (const [guildId, sightings] of Object.entries(sightingsByGuild)) {
      normalized[guildId] = this.normalizeSightings(sightings);
    }
    return normalized;
  }

  // Normalizes persisted per-guild local reports into the current LocalReport contract.
  // Invalid rows are skipped, missing fields are defaulted, and nested local pilot rows are sanitized.
  private normalizeLocalReportsByGuild(
    localReportsByGuild: unknown,
  ): Record<string, LocalReport[]> {
    const normalized: Record<string, LocalReport[]> = {};
    if (!localReportsByGuild || typeof localReportsByGuild !== "object") {
      return normalized;
    }

    for (const [guildId, localReports] of Object.entries(localReportsByGuild)) {
      if (!Array.isArray(localReports)) {
        normalized[guildId] = [];
        continue;
      }

      normalized[guildId] = localReports
        .filter(
          (report) =>
            !!report && typeof report === "object" && !Array.isArray(report),
        )
        .map((report) => {
          const raw = report as {
            System?: unknown;
            ScoutName?: unknown;
            Status?: unknown;
            Time?: unknown;
            Locals?: unknown;
            OnGrid?: unknown;
          };

          const localRows = Array.isArray(raw.Locals) ? raw.Locals : [];

          const locals: LocalPilot[] = localRows
            .map((local): LocalPilot | null => {
              if (!local || typeof local !== "object" || Array.isArray(local)) {
                return null;
              }

              const localObject = local as {
                Name?: unknown;
                CharacterID?: unknown;
                StandingHint?: unknown;
                StandingIconId?: unknown;
              };

              const name = String(localObject.Name ?? "").trim();
              if (!name) {
                return null;
              }

              const characterId = Number(localObject.CharacterID ?? 0);
              const standingIconId = Number(localObject.StandingIconId ?? 0);
              return {
                Name: name,
                CharacterID: Number.isFinite(characterId) ? characterId : 0,
                StandingHint: String(localObject.StandingHint ?? ""),
                StandingIconId: Number.isFinite(standingIconId)
                  ? Math.trunc(standingIconId)
                  : 0,
              };
            })
            .filter((local): local is LocalPilot => local !== null);

          const onGridRows = Array.isArray(raw.OnGrid) ? raw.OnGrid : [];
          const onGrid: GridPilot[] = onGridRows
            .map((gridPilot): GridPilot | null => {
              if (
                !gridPilot ||
                typeof gridPilot !== "object" ||
                Array.isArray(gridPilot)
              ) {
                return null;
              }

              const gridPilotObject = gridPilot as {
                PilotName?: unknown;
                ShipType?: unknown;
                ShipTypeId?: unknown;
                StandingHint?: unknown;
                StandingIconId?: unknown;
                Action?: unknown;
                Distance?: unknown;
                DistanceMeters?: unknown;
                Corporation?: unknown;
                Alliance?: unknown;
              };

              const pilotName = String(gridPilotObject.PilotName ?? "").trim();
              const shipType = String(gridPilotObject.ShipType ?? "").trim();
              const action = String(gridPilotObject.Action ?? "").trim();
              if (!pilotName || !shipType || !action) {
                return null;
              }

              const standingIconId = Number(
                gridPilotObject.StandingIconId ?? NaN,
              );
              const shipTypeId = Number(gridPilotObject.ShipTypeId ?? NaN);
              const distanceMeters = Number(
                gridPilotObject.DistanceMeters ?? NaN,
              );

              return {
                PilotName: pilotName,
                ShipType: shipType,
                ShipTypeId: Number.isFinite(shipTypeId)
                  ? Math.trunc(shipTypeId)
                  : undefined,
                StandingHint: String(gridPilotObject.StandingHint ?? ""),
                StandingIconId: Number.isFinite(standingIconId)
                  ? Math.trunc(standingIconId)
                  : undefined,
                Action: action,
                Distance:
                  String(gridPilotObject.Distance ?? "").trim() || undefined,
                DistanceMeters: Number.isFinite(distanceMeters)
                  ? distanceMeters
                  : undefined,
                Corporation:
                  String(gridPilotObject.Corporation ?? "").trim() || undefined,
                Alliance:
                  String(gridPilotObject.Alliance ?? "").trim() || undefined,
              };
            })
            .filter((gridPilot): gridPilot is GridPilot => gridPilot !== null);

          const rawTime = Number(raw.Time ?? Date.now());
          const normalizedTime =
            rawTime < 1_000_000_000_000 ? rawTime * 1000 : rawTime;

          return {
            System: String(raw.System ?? "Unknown"),
            ScoutName: String(raw.ScoutName ?? "Unknown"),
            Status: String(raw.Status ?? "Unknown"),
            Time: Number.isFinite(normalizedTime) ? normalizedTime : Date.now(),
            Locals: locals,
            OnGrid: onGrid,
          };
        });
    }
    return normalized;
  }

  // Normalizes raw sighting rows into a safe PilotSighting[] payload.
  // Invalid entries are dropped and all required fields are coerced/defaulted to stable values.
  private normalizeSightings(sightings: unknown): PilotSighting[] {
    if (!Array.isArray(sightings)) {
      return [];
    }

    return sightings
      .filter(
        (sighting) =>
          !!sighting &&
          typeof sighting === "object" &&
          !Array.isArray(sighting),
      )
      .map((sighting) => {
        const raw = sighting as {
          key?: unknown;
          name?: unknown;
          ship?: unknown;
          alliance?: unknown;
          corp?: unknown;
          wormhole?: unknown;
          firstSeenOnGrid?: unknown;
          lastSeenOnGrid?: unknown;
          wormholeName?: unknown;
          scoutName?: unknown;
          scoutDiscordId?: unknown;
          system?: unknown;
        };

        return {
          key: String(raw.key ?? "").replace("/", ""),
          name: String(raw.name ?? ""),
          ship: String(raw.ship ?? ""),
          alliance: String(raw.alliance ?? ""),
          corp: String(raw.corp ?? ""),
          wormhole: String(raw.wormhole ?? ""),
          firstSeenOnGrid:
            typeof raw.firstSeenOnGrid === "number" &&
            Number.isFinite(raw.firstSeenOnGrid)
              ? raw.firstSeenOnGrid
              : Date.now(),
          lastSeenOnGrid:
            typeof raw.lastSeenOnGrid === "number" &&
            Number.isFinite(raw.lastSeenOnGrid)
              ? raw.lastSeenOnGrid
              : Date.now(),
          wormholeName: String(raw.wormholeName ?? ""),
          scoutName: String(raw.scoutName ?? ""),
          scoutDiscordId: String(raw.scoutDiscordId ?? ""),
          system: String(raw.system ?? ""),
        };
      });
  }
}
