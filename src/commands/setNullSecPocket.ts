import {
  ApplicationCommandOptionType,
  Client,
  CommandInteraction,
  PermissionFlagsBits,
} from "discord.js";
import { Command } from "../Command.js";
import { Data } from "../Data.js";

/**
 * Sets the per-guild null-sec pocket label and system list.
 */
export const SetNullSecPocket: Command = {
  name: "set-nullsec-pocket",
  description: "Set null-sec pocket name and systems for this server",
  defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
  options: [
    {
      name: "name",
      description: "Pocket label (for example: Delve West Pocket)",
      type: ApplicationCommandOptionType.String,
      required: true,
    },
    {
      name: "systems",
      description: "Comma-separated systems in the pocket",
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
    const systemsOption = interaction.options.data.find((option) => option.name === "systems");

    const nullSecPocketName =
      typeof nameOption?.value === "string" ? nameOption.value.trim() : "";
    const systemsRaw =
      typeof systemsOption?.value === "string" ? systemsOption.value : "";

    const nullSecSystems = systemsRaw
      .split(",")
      .map((system) => system.trim())
      .filter((system) => system.length > 0);

    if (!nullSecPocketName) {
      await interaction.followUp({
        ephemeral: true,
        content: "You must provide a non-empty null-sec pocket name.",
      });
      return;
    }

    if (nullSecSystems.length === 0) {
      await interaction.followUp({
        ephemeral: true,
        content: "Provide at least one system in the systems list.",
      });
      return;
    }

    const existingConfig = await Data.getInstance().getGuildConfig(interaction.guildId);
    await Data.getInstance().setGuildIntelConfig(
      interaction.guildId,
      {
        singleSystemName: existingConfig?.intelConfig?.singleSystemName,
        nullSecPocketName,
        nullSecSystems,
      },
      interaction.user.id,
    );

    await Data.getInstance().logAudit({
      category: "command",
      action: "set-nullsec-pocket",
      outcome: "success",
      actorId: interaction.user.id,
      guildId: interaction.guildId,
      details: {
        nullSecPocketName,
        nullSecSystems,
      },
    });

    await interaction.followUp({
      ephemeral: true,
      content: [
        `Null-sec pocket label set to **${nullSecPocketName}**.`,
        `Systems: ${nullSecSystems.join(", ")}`,
      ].join("\n"),
    });
  },
};
