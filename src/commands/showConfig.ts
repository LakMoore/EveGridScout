import { Client, CommandInteraction, PermissionFlagsBits } from "discord.js";
import { Command } from "../Command.js";
import { Data } from "../Data.js";

/**
 * Shows current GridScout guild configuration.
 */
export const ShowConfig: Command = {
  name: "show-config",
  description: "Show current GridScout config for this server",
  defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
  run: async (client: Client, interaction: CommandInteraction) => {
    if (!interaction.inGuild() || !interaction.guildId) {
      await interaction.followUp({
        ephemeral: true,
        content: "This command can only be used inside a Discord server.",
      });
      return;
    }

    const config = await Data.getInstance().getGuildConfig(interaction.guildId);
    if (!config) {
      await interaction.followUp({
        ephemeral: true,
        content:
          "No GridScout config is set for this server yet. Use /set-viewer-role first.",
      });
      return;
    }

    const viewerRoleText = config.viewerRoleId
      ? `<@&${config.viewerRoleId}>`
      : "Not set";
    const eventChannelText = config.eventChannelId
      ? `<#${config.eventChannelId}>`
      : "Not set";
    const enabledEventsText =
      config.enabledEvents && config.enabledEvents.length > 0
        ? config.enabledEvents.join(", ")
        : "None";
    const singleSystemName =
      config.intelConfig?.singleSystemName ?? "Not set (defaults to Current system)";
    const nullSecPocketName =
      config.intelConfig?.nullSecPocketName ??
      "Not set (defaults to Null Sec pocket)";
    const nullSecSystems =
      config.intelConfig?.nullSecSystems &&
      config.intelConfig.nullSecSystems.length > 0
        ? config.intelConfig.nullSecSystems.join(", ")
        : "Not set";

    await Data.getInstance().logAudit({
      category: "command",
      action: "show-config",
      outcome: "success",
      actorId: interaction.user.id,
      guildId: interaction.guildId,
    });

    await interaction.followUp({
      ephemeral: true,
      content: [
        "**GridScout Server Config**",
        `Viewer Role: ${viewerRoleText}`,
        `Event Channel: ${eventChannelText}`,
        `Enabled Events: ${enabledEventsText}`,
        `Single System Label: ${singleSystemName}`,
        `Null Sec Pocket Label: ${nullSecPocketName}`,
        `Null Sec Systems: ${nullSecSystems}`,
      ].join("\n"),
    });
  },
};
