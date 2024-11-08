import { Data } from "./Data";

export class Grid {
  // singleton
  private static instance: Grid;
  private static seenInHoth: Array<string> = [];

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
    Grid.seenInHoth = await Data.getInstance().getData("seenInHoth");
    if (Grid.seenInHoth === undefined) {
      Grid.seenInHoth = [];
    } else {
      // Hack to ensure we never have any slashes in our grid keys
      Grid.seenInHoth = Grid.seenInHoth.map((k) => k.replace("/", ""));
    }
  }

  public seenSoFar() {
    return Grid.seenInHoth;
  }

  public async seenOnGrid(key: string) {
    if (!Grid.seenInHoth.includes(key)) {
      Grid.seenInHoth.push(key);
      (await Grid.getInstance()).save();
    }
  }

  async delete(key: string) {
    const found = Grid.seenInHoth.includes(key);
    Grid.seenInHoth = Grid.seenInHoth.filter((k) => k !== key);
    await this.save();
    return found;
  }
}
