import { Grid } from "./Grid";

export class MessageParser {
  // singleton
  private static instance: MessageParser;

  private headerWords = [
    "Type",
    "Corporation",
    "Alliance",
    "Name",
  ];

  public static getInstance(): MessageParser {
    if (!MessageParser.instance) {
      MessageParser.instance = new MessageParser();
    }
    return MessageParser.instance;
  }

  public async parse(message: string) {
    const lines = message.split("\n");
    let wormholeClass = "";

    const pilots: string[] = [];

    for (const line of lines) {
      if (line.length == 0 || line == "Nothing Found") {
        // do nothing
      } else if (line.startsWith("Wormhole ")) {
        // we're on grid with a wormhole
        wormholeClass = line.split(" ")[1];
      } else {
        // PILOT SHIP [CORP] [ALLIANCE]
        const words = line.split(" ");

        const key = line;
        // ALLIANCE is optional!
        if (words.length > 2) {
          // if we have 2 words, we're probably a pilot row
          if (this.headerWords.filter((h) => words.indexOf(h) > -1).length < 3) {
            // if we have fewer than 3 header words, we're not the header
            pilots.push(key);
          }
        }
      }
    }

    // ensuring we are on grid with a WH should reduce gibberish reports
    if (wormholeClass.length > 0 && pilots.length > 0) {
      const grid = await Grid.getInstance();
      return Promise.all(
        pilots.map((pilot) => {
          grid.seenOnGrid(pilot, wormholeClass);
        })
      );
    }
  }
}
