import {
  ApplicationCommandOptionType,
  Client,
  CommandInteraction,
  PermissionFlagsBits,
} from "discord.js";
import { Command } from "../Command.js";
import { Data } from "../Data.js";
import { GridScoutEventTypes } from "../GuildEvents.js";

/**
 * Enables one GridScout event notification type for this guild.
 */
export const EnableEvent: Command = {
  name: "enable-event",
  description: "Enable one GridScout event notification type",
  defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
  options: [
    {
      name: "event",
      description: "Event type to enable",
      type: ApplicationCommandOptionType.String,
      required: true,
      choices: GridScoutEventTypes.map((eventType) => ({
        name: eventType,
        value: eventType,
      })),
    },
  ],
  run: async (client: Client, interaction: CommandInteraction) => {
    if (!interaction.inGuild() || !interaction.guildId) {
      await interaction.followUp({
        ephemeral: true,
        content: "This command can only be used inside a Discord server.",
      });
      return;
    }

    const eventOption = interaction.options.data.find(
      (option) => option.name === "event",
    );
    const eventType =
      typeof eventOption?.value === "string" ? eventOption.value : "";

    if (
      !GridScoutEventTypes.includes(
        eventType as (typeof GridScoutEventTypes)[number],
      )
    ) {
      await interaction.followUp({
        ephemeral: true,
        content: "Invalid event type provided.",
      });
      return;
    }

    await Data.getInstance().enableGuildEvent(
      interaction.guildId,
      eventType,
      interaction.user.id,
    );

    await Data.getInstance().logAudit({
      category: "command",
      action: "enable-event",
      outcome: "success",
      actorId: interaction.user.id,
      guildId: interaction.guildId,
      details: {
        eventType,
      },
    });

    await interaction.followUp({
      ephemeral: true,
      content: `Enabled GridScout event: **${eventType}**.`,
    });
  },
};
