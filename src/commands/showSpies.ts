import { Client, CommandInteraction, PermissionFlagsBits } from "discord.js";
import { Command } from "../Command.js";
import { Data } from "../Data.js";

/**
 * Shows users currently flagged as suspected spies for this guild.
 */
export const ShowSpies: Command = {
  name: "show-spies",
  description: "List users currently locked out by spy status in this server",
  defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
  run: async (client: Client, interaction: CommandInteraction) => {
    if (!interaction.inGuild() || !interaction.guildId) {
      await interaction.followUp({
        ephemeral: true,
        content: "This command can only be used inside a Discord server.",
      });
      return;
    }

    const guildId = interaction.guildId;

    const allSpyFlags = await Data.getInstance().getSpyFlags();
    const spyFlagsForGuild = Object.values(allSpyFlags)
      .filter((entry) => entry.guildIds.includes(guildId))
      .sort((a, b) => b.lastDetectedAt.localeCompare(a.lastDetectedAt));

    await Data.getInstance().logAudit({
      category: "security",
      action: "show-spies",
      outcome: "success",
      actorId: interaction.user.id,
      guildId: interaction.guildId,
      details: {
        count: spyFlagsForGuild.length,
      },
    });

    if (spyFlagsForGuild.length === 0) {
      await interaction.followUp({
        ephemeral: true,
        content:
          "No users are currently locked out by spy status in this server.",
      });
      return;
    }

    const maxShown = 40;
    const displayed = spyFlagsForGuild.slice(0, maxShown);
    const lines = displayed.map((entry) => {
      const lastDetected = new Date(entry.lastDetectedAt).toLocaleString();
      return `• <@${entry.userId}> (${entry.userId}) — attempts: ${entry.attempts}, last detected: ${lastDetected}`;
    });

    const hiddenCount = spyFlagsForGuild.length - displayed.length;
    const hiddenLine =
      hiddenCount > 0 ? `\n...and ${hiddenCount} more user(s).` : "";

    await interaction.followUp({
      ephemeral: true,
      content:
        [
          `**Suspected spies in this server (${spyFlagsForGuild.length})**`,
          ...lines,
        ].join("\n") + hiddenLine,
    });
  },
};
