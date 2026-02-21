import {
  ApplicationCommandOptionType,
  Client,
  CommandInteraction,
  PermissionFlagsBits,
} from "discord.js";
import { Command } from "../Command.js";
import { Data } from "../Data.js";

/**
 * Sets the per-guild single-system wormhole label shown in sightings views.
 */
export const SetSingleSystem: Command = {
  name: "set-single-system",
  description: "Set the single-system wormhole label for this server",
  defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
  options: [
    {
      name: "name",
      description: "System label (for example: Hoth)",
      type: ApplicationCommandOptionType.String,
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

    const nameOption = interaction.options.data.find((option) => option.name === "name");
    const singleSystemName =
      typeof nameOption?.value === "string" ? nameOption.value.trim() : "";

    if (!singleSystemName) {
      await interaction.followUp({
        ephemeral: true,
        content: "You must provide a non-empty system label.",
      });
      return;
    }

    const existingConfig = await Data.getInstance().getGuildConfig(interaction.guildId);
    await Data.getInstance().setGuildIntelConfig(
      interaction.guildId,
      {
        singleSystemName,
        nullSecPocketName: existingConfig?.intelConfig?.nullSecPocketName,
        nullSecSystems: existingConfig?.intelConfig?.nullSecSystems ?? [],
      },
      interaction.user.id,
    );

    await Data.getInstance().logAudit({
      category: "command",
      action: "set-single-system",
      outcome: "success",
      actorId: interaction.user.id,
      guildId: interaction.guildId,
      details: {
        singleSystemName,
      },
    });

    await interaction.followUp({
      ephemeral: true,
      content: `Single-system label set to **${singleSystemName}**.`,
    });
  },
};
