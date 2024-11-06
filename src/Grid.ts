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
    await Data.saveData("seenInHoth", Grid.seenInHoth);
  }

  public async load() {
    console.log("Loading seen in Hoth...");
    Grid.seenInHoth = await Data.getData("seenInHoth");
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
}
