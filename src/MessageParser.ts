import { Grid } from "./Grid";
import { ScoutMessage } from "./ScoutMessage";

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

  public async parse(body: string) {

    // if message is a json object, cast it to a ScoutMessage
    let message: ScoutMessage;
    try {
      message = JSON.parse(body) as ScoutMessage;
    } catch (e) {
      console.log(e);
      message = {
        Message: body,
        Scout: 'unknown',
        Wormhole: 'unknown'
      } as ScoutMessage;
    }

    console.log(message);

    const grid = await Grid.getInstance();

    // record the ping for this scout
    if (message.Message.startsWith("{")) {
      const keepalive = JSON.parse(message.Message);
      const version = keepalive.Version;
      grid.scoutReport(message.Scout, message.Wormhole, version);
    } else {
      grid.scoutReport(message.Scout, message.Wormhole);
    }

    const lines = message.Message.split("\n");
    let wormholeClass = "";

    if (message.Message == "Possible activation detected!") {
      // record an activation in the log
      console.log(`Activation detected by ${message.Scout} on ${message.Wormhole}`);
      grid.activation(message.Scout, message.Wormhole);
    } else {
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
        return Promise.all(
          pilots.map((pilot) => {
            console.log(pilot);
            grid.seenOnGrid(pilot, wormholeClass, message.Scout, message.Wormhole);
          })
        );
      }
    }

  }
}
