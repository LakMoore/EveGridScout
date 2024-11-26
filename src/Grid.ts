import { Data } from "./Data";

export interface PilotSighting {
  key: string;
  name: string;
  ship: string;
  alliance: string;
  corp: string;
  wormhole: string;
  firstSeenOnGrid: number;
  lastSeenOnGrid: number;
}

export class Grid {
  // singleton
  private static instance: Grid;
  private static seenInHoth: Array<PilotSighting> = [];

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
          };
        });
      } else {
        Grid.seenInHoth = temp;
      }
      // Hack to ensure we never have any slashes in our grid keys
      Grid.seenInHoth.forEach((k) => (k.key = k.key.replace("/", "")));
    }
  }

  public seenSoFar() {
    return Grid.seenInHoth;
  }

  public async seenOnGrid(key: string, wormholeClass: string) {
    const pilot = Grid.seenInHoth.find((p) => p.key === key);

    if (!pilot) {
      // first time we've seen this pilot
      Grid.seenInHoth.push({
        key,
        name: "",
        ship: "",
        alliance: "",
        corp: "",
        wormhole: wormholeClass,
        firstSeenOnGrid: Date.now(),
        lastSeenOnGrid: Date.now(),
      });
    } else {
      // seen before
      pilot.lastSeenOnGrid = Date.now();
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
