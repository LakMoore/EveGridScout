import { Client } from "discord.js";
import { Commands } from "../Commands.js";

export default (client: Client): void => {
  client.on("ready", async () => {
    if (!client.user || !client.application) {
      return;
    }

    await client.application.commands.set(Commands);

    console.log(`${client.user.username} is online`);
    console.log(`Connected guilds: ${client.guilds.cache.size}`);
    if (client.guilds.cache.size > 0) {
      console.log(
        `Guild IDs: ${Array.from(client.guilds.cache.keys()).join(", ")}`,
      );
    }
  });
};
