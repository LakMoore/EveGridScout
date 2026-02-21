import {
  ApplicationCommandOptionType,
  Client,
  CommandInteraction,
  PermissionFlagsBits,
} from "discord.js";
import { Command } from "../Command.js";
import { Data } from "../Data.js";

/**
 * Sets the guild viewer role used to authorize web log access.
 */
export const SetViewerRole: Command = {
  name: "set-viewer-role",
  description: "Set the Discord role allowed to view GridScout web logs",
  defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
  options: [
    {
      name: "role",
      description: "Existing guild role to grant web log access",
      type: ApplicationCommandOptionType.Role,
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

    const roleOption = interaction.options.data.find((o) => o.name === "role");
    const roleId =
      typeof roleOption?.value === "string" ? roleOption.value : "";
    if (!roleId) {
      await interaction.followUp({
        ephemeral: true,
        content: "No role was provided.",
      });
      return;
    }

    const guild = interaction.guild;
    const role = guild?.roles.cache.get(roleId);
    if (!role) {
      await interaction.followUp({
        ephemeral: true,
        content:
          "That role could not be resolved in this server. Please try again.",
      });
      return;
    }

    await Data.getInstance().setGuildViewerRole(
      interaction.guildId,
      role.id,
      interaction.user.id,
    );

    await Data.getInstance().logAudit({
      category: "command",
      action: "set-viewer-role",
      outcome: "success",
      actorId: interaction.user.id,
      guildId: interaction.guildId,
      details: {
        roleId: role.id,
        roleName: role.name,
      },
    });

    await interaction.followUp({
      ephemeral: true,
      content: `Viewer role for this server set to **${role.name}** (${role.id}).`,
    });
  },
};
