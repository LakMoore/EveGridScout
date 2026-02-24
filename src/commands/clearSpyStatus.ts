import {
  ApplicationCommandOptionType,
  Client,
  CommandInteraction,
  PermissionFlagsBits,
} from "discord.js";
import { Command } from "../Command.js";
import { Data } from "../Data.js";

/**
 * Clears a user's spy status for the current guild.
 */
export const ClearSpyStatus: Command = {
  name: "clear-spy-status",
  description: "Remove spy status for a user in this server",
  defaultMemberPermissions: PermissionFlagsBits.Administrator,
  options: [
    {
      name: "user",
      description: "User whose spy status should be cleared for this server",
      type: ApplicationCommandOptionType.User,
      required: true,
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

    const userOption = interaction.options.data.find(
      (option) => option.name === "user",
    );
    const targetUserId =
      typeof userOption?.value === "string" ? userOption.value : "";

    if (!targetUserId) {
      await interaction.followUp({
        ephemeral: true,
        content: "No user was provided.",
      });
      return;
    }

    const result = await Data.getInstance().removeSpyFlagForGuild(
      targetUserId,
      interaction.guildId,
    );

    await Data.getInstance().logAudit({
      category: "security",
      action: "clear-spy-status",
      outcome: "success",
      actorId: interaction.user.id,
      guildId: interaction.guildId,
      details: {
        targetUserId,
        removedForGuild: result.removedForGuild,
        hadSpyFlag: result.found,
        remainingGuildIds: result.remainingGuildIds,
      },
    });

    if (!result.found) {
      await interaction.followUp({
        ephemeral: true,
        content: `No spy status is currently recorded for <@${targetUserId}>.`,
      });
      return;
    }

    if (!result.removedForGuild) {
      await interaction.followUp({
        ephemeral: true,
        content:
          `No spy status for this server was found for <@${targetUserId}>.` +
          " Their flag remains unchanged.",
      });
      return;
    }

    if (result.remainingGuildIds.length > 0) {
      await interaction.followUp({
        ephemeral: true,
        content:
          `Removed spy status for this server from <@${targetUserId}>.` +
          ` They are still flagged in ${result.remainingGuildIds.length} other server(s).`,
      });
      return;
    }

    await interaction.followUp({
      ephemeral: true,
      content: `Spy status fully cleared for <@${targetUserId}>.`,
    });
  },
};
