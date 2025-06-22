import { Data } from "./Data";
import { PilotSighting } from "./PilotSighting";
import { ScoutEntry } from "./ScoutEntry";
import { ScoutMessage } from "./ScoutMessage";

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
  private static seenInHoth: Array<PilotSighting> = [];
  private static scoutReports: Map<string, Scout> = new Map<string, Scout>();

  public static async getInstance(): Promise<Grid> {
    if (!Grid.instance) {
      Grid.instance = new Grid();
      await Grid.instance.load();
    }
    return Grid.instance;
  }

  public async save() {
    await Data.getInstance().saveData("seenInHoth", Grid.seenInHoth);
  }

  public async load() {
    console.log("Loading seen in Hoth...");
    const temp = await Data.getInstance().getData("seenInHoth");
    if (temp === undefined) {
      Grid.seenInHoth = [];
    } else {
      // if it is an array of strings
      if (
        Array.isArray(temp) &&
        temp.length > 0 &&
        typeof temp[0] === "string"
      ) {
        // upgrade the old format
        Grid.seenInHoth = temp.map((k: string) => {
          return {
            key: k,
            name: k,
            ship: "",
            alliance: "",
            corp: "",
            wormhole: "",
            firstSeenOnGrid: Date.now(),
            lastSeenOnGrid: Date.now(),
            wormholeName: "",
            scoutName: "",
            scoutDiscordId: "",
            system: ""
          };
        });
      } else {
        Grid.seenInHoth = temp;
      }
      Grid.seenInHoth.forEach((k) => {
        // Hack to ensure we never have any slashes in our grid keys
        k.key = k.key.replace("/", "");
        // upgrade the old format
        if (k.wormholeName === undefined) {
          k.wormholeName = "";
        }
        if (k.scoutName === undefined) {
          k.scoutName = "";
        }
        if (k.scoutDiscordId === undefined) {
          k.scoutDiscordId = "";
        }
      });
    }
  }

  public seenSoFar() {
    return Grid.seenInHoth;
  }

  public getScoutReports() {
    // remove any reports older than 5 minutes
    const now = Date.now();
    const oldKeys = Array.from(Grid.scoutReports.keys())
      .filter((key) =>
        now - Grid.scoutReports.get(key)!.lastSeen.getTime() > 5 * 60 * 1000
      );
    for (const key of oldKeys) {
      Grid.scoutReports.delete(key);
    }

    return Grid.scoutReports;
  }

  public scoutReport(scout: ScoutMessage) {
    let entry = Grid.scoutReports.get(scout.Scout);

    // if doesn't exist, make one
    if (!entry) {
      entry = {
        name: scout.Scout,
        system: scout.System,
        wormhole: scout.Wormhole,
        wormholeClass: "",
        discordId: "",
        version: scout.Version,
        lastSeen: new Date(),
      };
      Grid.scoutReports.set(scout.Scout, entry);
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
    entry.version = scout.Version;
    entry.lastSeen = new Date();
  }

  public async activation(scout: string, wormhole: string, system: string) {

    const key = `Activation/${scout}/${wormhole}/${Date.now()}`;

    Grid.seenInHoth.push({
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
      scoutDiscordId: "",
      system
    });

    await this.save();
  }

  public async seenOnGrid(entry: ScoutEntry, wormholeClass: string, scoutName: string, wormholeCode: string, system: string) {

    // We want to track this pilot in this ship
    var key = `${entry.Name}/${entry.Type}`;

    // get the most recent sighting of this pilot in this ship
    const recentSighting = Grid.seenInHoth.findLast((p) => p.key === key);

    // if we don't have a recent sighting or it was on a different wormhole
    if (!recentSighting || recentSighting.wormhole !== wormholeCode) {
      // call this a new sighting!
      Grid.seenInHoth.push({
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
        scoutDiscordId: "",
        system
      });
    } else {
      // seen this pilot at this location most recently
      recentSighting.lastSeenOnGrid = Date.now();
      // move it to the end of the list
      Grid.seenInHoth = Grid.seenInHoth.filter((p) => p.key !== key);
      Grid.seenInHoth.push(recentSighting);
    }
    await this.save();
  }

  async delete(key: string) {
    const startLength = Grid.seenInHoth.length;
    Grid.seenInHoth = Grid.seenInHoth.filter((k) => k.key !== key);
    await this.save();
    return startLength !== Grid.seenInHoth.length;
  }
}
