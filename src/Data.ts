import storage from "node-persist";

export class Data {
  //singleton
  private static instance: Data;

  public static getInstance() {
    if (!this.instance) {
      this.instance = new Data();
    }
    return this.instance;
  }

  private constructor() {}

  public static async initialise() {
    await storage.init();
  }

  public static async saveData(key: string, value: any) {
    await storage.setItem(key, value);
  }

  public static async getData(key: string) {
    return await storage.getItem(key);
  }
}
