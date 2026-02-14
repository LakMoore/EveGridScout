import { Grid } from "./Grid.js";
import { ScoutEntry } from "./ScoutEntry.js";
import { ScoutMessage } from "./ScoutMessage.js";

export class MessageParser {
  // singleton
  private static instance: MessageParser;

  private headerWords = ["Type", "Corporation", "Alliance", "Name"];

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
    }
    catch (e) {
      console.log(e);
      message = {
        Message: body,
        Scout: "unknown",
        Wormhole: "unknown",
      } as ScoutMessage;
    }

    console.log(message);

    const grid = await Grid.getInstance();

    // record the ping for this scout
    grid.scoutReport(message);

    const lines = message.Message.split("\n");
    let wormholeClass = "";

    if (message.Message == "Possible activation detected!") {
      // record an activation in the log
      console.log(
        `Activation detected by ${message.Scout} on ${message.Wormhole}`,
      );
      grid.activation(message.Scout, message.Wormhole, message.System ?? "");
    }
    else {
      const pilots: ScoutEntry[] =
        message.Entries?.filter((p) => !p.Type?.startsWith("Wormhole "))
        ?? this.parsePilots(lines);

      // use Entries if available
      const wh = message.Entries?.find((p) => p.Type?.startsWith("Wormhole "));
      if (wh) {
        wormholeClass = wh.Type?.split(" ")[1] ?? "";
      }
      else {
        // otherwise parse the lines to find the wormhole
        const wormhole = lines.find((line) => line.startsWith("Wormhole "));
        wormholeClass = wormhole?.split(" ")[1] ?? "";
      }

      // ensuring we are on grid with a WH should reduce gibberish reports
      // if (wormholeClass.length > 0 && pilots.length > 0) {

      // no longer want to just scout wormholes
      if (pilots.length > 0) {
        return Promise.all(
          pilots.map((pilot) => {
            console.log(pilot);
            grid.seenOnGrid(
              pilot,
              wormholeClass,
              message.Scout,
              message.Wormhole,
              message.System ?? "",
            );
          }),
        );
      }
    }
  }

  /**
   * parse the pilots from the lines
   * @param lines the lines from the message
   * @param wormholeClass the wormhole class found in the lines
   * @returns an array of pilot strings
   */
  private parsePilots(lines: string[]): ScoutEntry[] {
    const pilots: ScoutEntry[] = [];

    for (const line of lines) {
      if (line.length == 0 || line == "Nothing Found") {
        // do nothing
      }
      else if (line.startsWith("Wormhole ")) {
        // this line is the wormhole so skip it
      }
      else {
        // PILOT SHIP [CORP] [ALLIANCE]
        const words = line.split(" ");

        const key = line;
        // ALLIANCE is optional!
        if (words.length > 2) {
          // if we have 2 words, we're probably a pilot row
          if (
            this.headerWords.filter((h) => words.indexOf(h) > -1).length < 3
          ) {
            // if we have fewer than 3 header words, we're not the header

            // data = "Vexor Navy Issue [FFEW] [WEFEW] Sleezi Estidal"

            // find the index of words that start with square brackets
            const shipNameLength = words.findIndex(
              (word) => word.startsWith("[") || word.endsWith("]"),
            );

            var shipName = "";
            var corp = "";
            var alliance = "";
            var name = "";

            if (shipNameLength === -1) {
              shipName = line;
            }
            else {
              // ship is the first shipNameLength words
              shipName = words.slice(0, shipNameLength).join(" ");

              // corp is the first word after shipNameLength
              if (words.length > shipNameLength) {
                corp = words[shipNameLength].replace("[", "").replace("]", "");
              }

              // alliance is the second word after shipNameLength
              if (shipNameLength + 1 <= words.length) {
                alliance = words[shipNameLength + 1]
                  .replace("[", "")
                  .replace("]", "");
              }

              // name is the rest of the words
              if (shipNameLength + 2 <= words.length) {
                name = words.slice(shipNameLength + 2).join(" ");
              }
            }

            pilots.push({
              Type: shipName,
              Corporation: corp,
              Alliance: alliance,
              Name: name,
            } as ScoutEntry);
          }
        }
      }
    }

    return pilots;
  }
}
