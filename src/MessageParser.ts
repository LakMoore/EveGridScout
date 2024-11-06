import { Grid } from "./Grid";

export class MessageParser {
  // singleton
  private static instance: MessageParser;

  public static getInstance(): MessageParser {
    if (!MessageParser.instance) {
      MessageParser.instance = new MessageParser();
    }
    return MessageParser.instance;
  }

  public static async parse(message: string) {
    const lines = message.split("\n");
    let wormhole = false;

    for (const line of lines) {
      if (line == "Nothing Found") {
        // do nothing
      } else if (line.startsWith("Wormhole")) {
        // we're on grid with a wormhole
        wormhole = true;
      } else {
        const key = line;
        await (await Grid.getInstance()).seenOnGrid(key);

        // PILOT SHIP [CORP] [ALLIANCE]
        const words = line.split(" ");
      }
    }
  }
}
