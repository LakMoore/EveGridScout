import { Data } from "./Data";
import { createHash } from "crypto";
import { PilotSighting } from "./PilotSighting";

export class Grid {
  // singleton
  private static instance: Grid;
  private static seenInHoth: Array<PilotSighting> = [];
  private static scoutReports: Map<string, Date> = new Map<string, Date>();

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
        now - Grid.scoutReports.get(key)!.getTime() > 5 * 60 * 1000
      );
    for (const key of oldKeys) {
      Grid.scoutReports.delete(key);
    }

    return Grid.scoutReports;
  }

  public scoutReport(scout: string, wormhole: string) {
    Grid.scoutReports.set(`${scout} (${wormhole})`, new Date());
  }

  public async activation(scout: string, wormhole: string) {

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
    });

    await this.save();
  }

  public async seenOnGrid(data: string, wormholeClass: string, scout: string, wormhole: string) {

    // This scout saw this pilot on this grid
    var key = data + "/" + scout + "/" + wormhole;

    // Hash the key
    key = createHash("sha256").update(key).digest("hex");
    console.log(key);

    const pilot = Grid.seenInHoth.find((p) => p.key === key);

    // data = "Vexor Navy Issue [FFEW] [WEFEW] Sleezi Estidal"

    const words = data.split(" ");
    // find the index of words that start with square brackets
    const shipNameLength = words.findIndex((word) => word.startsWith("[") || word.endsWith("]"));

    var shipName = "";
    var corp = "";
    var alliance = "";
    var name = "";

    if (shipNameLength === -1) {
      shipName = data;
    } else {
      // ship is the first shipNameLength words
      shipName = words.slice(0, shipNameLength).join(" ");

      // corp is the first word after shipNameLength
      if (words.length > shipNameLength) {
        corp = words[shipNameLength].replace("[", "").replace("]", "");
      }

      // alliance is the second word after shipNameLength
      if (shipNameLength + 1 <= words.length) {
        alliance = words[shipNameLength + 1].replace("[", "").replace("]", "");
      }

      // name is the rest of the words
      if (shipNameLength + 2 <= words.length) {
        name = words.slice(shipNameLength + 2).join(" ");
      }
    }


    if (!pilot) {
      // first time we've seen this pilot
      Grid.seenInHoth.push({
        key,
        name,
        ship: shipName,
        alliance,
        corp,
        wormhole: wormholeClass,
        firstSeenOnGrid: Date.now(),
        lastSeenOnGrid: Date.now(),
        wormholeName: wormhole,
        scoutName: scout,
        scoutDiscordId: "",
      });
    } else {
      // seen before
      pilot.lastSeenOnGrid = Date.now();
      pilot.wormhole = wormholeClass;
      // move it to the end of the list
      Grid.seenInHoth = Grid.seenInHoth.filter((p) => p.key !== key);
      Grid.seenInHoth.push(pilot);
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
