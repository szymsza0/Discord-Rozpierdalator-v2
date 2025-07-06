// commands/connect.js
import { PermissionFlagsBits } from "discord.js";
import { TRELLO_API_BASE, TRELLO_KEY, TRELLO_TOKEN } from "../config.js";
import fetch from "node-fetch";
import { EmbedBuilder } from "discord.js";
import {
  getAllUserMappings,
  saveUserMapping,
  removeUserMapping,
  getTrelloUsernameForDiscord,
} from "../utils/database.js";

// Function to get a Trello member from a Discord username
export async function getTrelloMemberFromDiscord(discordUsername) {
  const trelloUsername = await getTrelloUsernameForDiscord(discordUsername);

  if (!trelloUsername) {
    return null;
  }

  // Get Trello member ID
  try {
    const url = `${TRELLO_API_BASE}/members/${trelloUsername}?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`;
    const response = await fetch(url);

    if (!response.ok) {
      console.error(`❌ Trello API Error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data.id;
  } catch (error) {
    console.error(`🚨 Error getting Trello member: ${error}`);
    return null;
  }
}

async function searchTrelloMembers(query) {
  try {
    const url = `${TRELLO_API_BASE}/search/members?query=${encodeURIComponent(
      query
    )}&key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`;
    const response = await fetch(url);

    if (!response.ok) {
      console.error(`❌ Trello API Error: ${response.status}`);
      return [];
    }

    const results = await response.json();

    // Filter for exact matches only
    return results.filter((member) => {
      const username = member.username.toLowerCase();
      const fullName = (member.fullName || "").toLowerCase();
      const searchTerm = query.toLowerCase();

      // Split full name into parts (first name, last name)
      const nameParts = fullName.split(" ");

      // Check for exact matches only - username, full name, or a single name part
      return (
        username === searchTerm ||
        fullName === searchTerm ||
        nameParts.some((part) => part === searchTerm)
      );
    });
  } catch (error) {
    console.error(`🚨 Error searching Trello members: ${error}`);
    return [];
  }
}

export async function processConnectCommand(message) {
  try {
    // Parse command arguments: !connect discord_username trello_username
    const args = message.content.slice("!connect".length).trim().split(/\s+/);

    if (args.length < 2) {
      const errorEmbed = new EmbedBuilder()
        .setColor("#FF0000")
        .setDescription("❌ Użycie: !connect nazwa_discord nazwa_trello");

      return message.reply({ embeds: [errorEmbed] });
    }

    // Get Discord username (without requiring @mention)
    const discordUsername = args[0].replace(/[<@!>]/g, "");

    // Check if it's a mention or just a username
    let discordUser;
    if (args[0].startsWith("<@") && args[0].endsWith(">")) {
      // It's a mention, get the user by ID
      const discordUserId = discordUsername;
      try {
        discordUser = await message.client.users.fetch(discordUserId);
      } catch (error) {
        console.error("Failed to fetch user by ID:", error);
      }
    }

    // If we couldn't get a user by ID, just use the username as provided
    if (!discordUser) {
      discordUser = { username: discordUsername };
    }

    const trelloUsername = args[1];

    // Check if Trello user exists
    const trelloMembers = await searchTrelloMembers(trelloUsername);
    if (trelloMembers.length === 0) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setDescription(
              `❌ Nie znaleziono użytkownika Trello o nazwie "${trelloUsername}". Sprawdź pisownię i spróbuj ponownie.`
            ),
        ],
      });
    }

    const exactMatch = trelloMembers.find(
      (m) =>
        m.username.toLowerCase() === trelloUsername.toLowerCase() ||
        m.fullName?.toLowerCase() === trelloUsername.toLowerCase()
    );

    const trelloUser = exactMatch || trelloMembers[0];

    // Add new mapping to the database
    await saveUserMapping(discordUser.username, trelloUser.username);

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor("#00FF00")
          .setDescription(
            `✅ Pomyślnie połączono: Discord **${
              discordUser.username
            }** → Trello **${trelloUser.fullName || trelloUser.username}** (@${
              trelloUser.username
            })`
          ),
      ],
    });
  } catch (error) {
    console.error("🚨 Error processing connect command:", error);

    const errorEmbed = new EmbedBuilder()
      .setColor("#FF0000")
      .setDescription("❌ Wystąpił błąd podczas przetwarzania komendy");

    return message.reply({ embeds: [errorEmbed] });
  }
}

export async function processDisconnectCommand(message) {
  try {
    // Parse command arguments: !disconnect discord_username
    const args = message.content
      .slice("!disconnect".length)
      .trim()
      .split(/\s+/);

    if (args.length === 0) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setDescription("❌ Użycie: !disconnect nazwa_discord"),
        ],
      });
    }

    // Get Discord username (without requiring @mention)
    const discordUsername = args[0].replace(/[<@!>]/g, "");

    // Check if the user is connected
    const trelloUsername = await getTrelloUsernameForDiscord(discordUsername);

    if (!trelloUsername) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FFFF00")
            .setDescription(
              `ℹ️ Użytkownik **${discordUsername}** nie był połączony.`
            ),
        ],
      });
    }

    // Remove the mapping from database
    const removed = await removeUserMapping(discordUsername);

    if (!removed) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FFFF00")
            .setDescription(
              `ℹ️ Nie udało się rozłączyć użytkownika **${discordUsername}**.`
            ),
        ],
      });
    }

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor("#00FF00")
          .setDescription(
            `✅ Rozłączono konto: Discord **${discordUsername}** od Trello **${trelloUsername}**`
          ),
      ],
    });
  } catch (error) {
    console.error("🚨 Error processing disconnect command:", error);
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor("#FF0000")
          .setDescription("❌ Wystąpił błąd podczas rozłączania konta"),
      ],
    });
  }
}

export async function getConnectionsCommand(message) {
  try {
    const mappings = await getAllUserMappings();

    if (Object.keys(mappings).length === 0) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FFFF00")
            .setDescription(
              "🏜️ Brak jakichkolwiek połączeń między kontami Discord a Trello."
            ),
        ],
      });
    }

    const embed = new EmbedBuilder()
      .setColor("#00FF00")
      .setTitle("📋 Połączenia kont")
      .setDescription("Lista połączonych kont Discord i Trello:");

    Object.entries(mappings).forEach(([discordUsername, trelloUsername]) => {
      embed.addFields({
        name: `💻 Discord: ${discordUsername}`,
        value: `🌐 Trello: @${trelloUsername}`,
        inline: false,
      });
    });

    return message.reply({ embeds: [embed] });
  } catch (error) {
    console.error("🚨 Błąd podczas pobierania połączeń:", error);
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor("#FF0000")
          .setDescription("❌ Nie udało się pobrać listy połączeń."),
      ],
    });
  }
}

// Optional: Migration function to move data from JSON to SQLite
export async function migrateFromJson(jsonFilePath) {
  try {
    const fs = await import("fs/promises");

    try {
      const jsonData = await fs.readFile(jsonFilePath, "utf-8");
      const mappings = JSON.parse(jsonData);

      console.log(
        `📤 Migrating ${
          Object.keys(mappings).length
        } mappings from JSON to database...`
      );

      // Save all mappings to database
      for (const [discordUsername, trelloUsername] of Object.entries(
        mappings
      )) {
        await saveUserMapping(discordUsername, trelloUsername);
      }

      console.log("✅ Migration complete");

      // Backup the old JSON file
      await fs.rename(jsonFilePath, `${jsonFilePath}.bak`);
      console.log(`✅ Original JSON file backed up to ${jsonFilePath}.bak`);

      return true;
    } catch (readError) {
      console.error("❌ Failed to read JSON file:", readError);
      if (readError.code === "ENOENT") {
        console.log("JSON file does not exist, no migration needed");
        return true;
      }
      return false;
    }
  } catch (error) {
    console.error("🚨 Migration error:", error);
    return false;
  }
}
