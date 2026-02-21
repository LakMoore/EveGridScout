import {
  ApplicationCommandOptionType,
  ChannelType,
  Client,
  CommandInteraction,
  PermissionFlagsBits,
} from "discord.js";
import { Command } from "../Command.js";
import { Data } from "../Data.js";

/**
 * Sets the guild channel used for GridScout notifications.
 */
export const SetEventChannel: Command = {
  name: "set-event-channel",
  description: "Set the channel used for GridScout event notifications",
  defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
  options: [
    {
      name: "channel",
      description: "Text channel for GridScout notifications",
      type: ApplicationCommandOptionType.Channel,
      required: true,
      channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
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

    const channelOption = interaction.options.data.find(
      (option) => option.name === "channel",
    );
    const channelId =
      typeof channelOption?.value === "string" ? channelOption.value : "";

    if (!channelId) {
      await interaction.followUp({
        ephemeral: true,
        content: "No channel was provided.",
      });
      return;
    }

    const guildChannel = interaction.guild?.channels.cache.get(channelId);
    if (!guildChannel) {
      await interaction.followUp({
        ephemeral: true,
        content:
          "That channel could not be resolved in this server. Please try again.",
      });
      return;
    }

    await Data.getInstance().setGuildEventChannel(
      interaction.guildId,
      channelId,
      interaction.user.id,
    );

    await Data.getInstance().logAudit({
      category: "command",
      action: "set-event-channel",
      outcome: "success",
      actorId: interaction.user.id,
      guildId: interaction.guildId,
      details: {
        channelId,
      },
    });

    await interaction.followUp({
      ephemeral: true,
      content: `Event notification channel set to <#${channelId}>.`,
    });
  },
};
