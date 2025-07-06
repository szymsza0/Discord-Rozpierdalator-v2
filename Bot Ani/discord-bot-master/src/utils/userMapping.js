// utils/userMapping.js
import {
  TRELLO_API_BASE,
  TRELLO_KEY,
  TRELLO_TOKEN,
  ALLOWED_GUILD_ID,
} from "../config.js";
import fetch from "node-fetch";
import { EmbedBuilder } from "discord.js";
import { ActionRowBuilder, StringSelectMenuBuilder } from "discord.js";
import { getTrelloMemberFromDiscord } from "../commands/connect.js";
import { getTrelloUsernameForDiscord } from "../utils/database.js";

/**
 * Find Trello members by name
 * @param {string} name - First name to search for
 * @returns {Promise<Array|null>} - Array of matching Trello members or null if error
 */
export async function findTrelloMembersByName(name) {
  try {
    // Normalize the search name - lowercase and remove any extra spaces
    const searchName = name.toLowerCase().trim();

    if (!searchName) {
      console.warn("⚠️ Empty name provided for Trello member search");
      return [];
    }

    console.log(
      `🔍 Searching for Trello members with name containing "${searchName}"`
    );

    // Get all workspace members
    const url = `${TRELLO_API_BASE}/organizations/${ALLOWED_GUILD_ID}/members?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`;
    const response = await fetch(url);

    if (!response.ok) {
      console.error(
        `❌ Trello API error fetching organization members: ${response.status}`
      );
      return null;
    }

    const members = await response.json();

    // Filter members whose fullName contains the search name
    const matchingMembers = members.filter((member) => {
      const fullName = (member.fullName || "").toLowerCase();
      return fullName.includes(searchName);
    });

    console.log(
      `✅ Found ${matchingMembers.length} Trello members matching "${searchName}"`
    );
    return matchingMembers;
  } catch (error) {
    console.error(`🚨 Error finding Trello members by name:`, error);
    return null;
  }
}

/**
 * Ask the user to select one of the Trello members from a list
 * @param {Object} message - Discord message object
 * @param {string} personName - Name of the person
 * @param {Array} matchingMembers - Array of matching Trello members
 * @returns {Promise<string|null>} - Selected Trello member ID or null
 */
export async function askUserToSelectTrelloMember(
  message,
  personName,
  matchingMembers
) {
  try {
    if (!matchingMembers || matchingMembers.length === 0) {
      return null;
    }

    // If only one match, return it directly
    if (matchingMembers.length === 1) {
      return matchingMembers[0].id;
    }

    // Create selection options for the dropdown
    const options = matchingMembers.map((member) => ({
      label: member.fullName || member.username,
      description: `Trello username: ${member.username}`,
      value: member.id,
    }));

    // Add a "None" option
    options.push({
      label: "None of these",
      description: "Don't assign any Trello member",
      value: "none",
    });

    // Create the selection menu
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`trello_member_select_${Date.now()}`)
      .setPlaceholder(`Select Trello member for ${personName}`)
      .addOptions(options);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    // Send the selection message
    const selectMessage = await message.reply({
      content: `📋 Multiple Trello members found for "${personName}". Please select the correct one:`,
      components: [row],
    });

    // Wait for user response (up to 60 seconds)
    try {
      // Create a filter to only accept responses from the original message author
      const filter = (interaction) =>
        interaction.customId === selectMenu.data.custom_id &&
        interaction.user.id === message.author.id;

      // Wait for selection
      const interaction = await selectMessage.awaitMessageComponent({
        filter,
        time: 60000,
      });

      // Get the selected value
      const selectedId = interaction.values[0];

      // Update the message to show selection was made
      await interaction.update({
        content:
          selectedId === "none"
            ? `✅ No Trello member will be assigned for "${personName}"`
            : `✅ Selected Trello member for "${personName}": ${
                matchingMembers.find((m) => m.id === selectedId)?.fullName ||
                "Unknown"
              }`,
        components: [],
      });

      return selectedId === "none" ? null : selectedId;
    } catch (error) {
      // Handle timeout or other errors
      try {
        await selectMessage.edit({
          content: `⌛ Selection timed out. No Trello member will be assigned for "${personName}".`,
          components: [],
        });
      } catch (editError) {
        console.error("Could not edit selection message:", editError);
      }
      return null;
    }
  } catch (error) {
    console.error(`🚨 Error in askUserToSelectTrelloMember:`, error);
    return null;
  }
}

/**
 * Get Trello member ID from Discord username
 * @param {string} discordUsername - The Discord username
 * @returns {Promise<string|null>} - The Trello member ID or null if not found
 */
export async function getTrelloMemberIdFromDiscord(discordUsername) {
  try {
    // First check if we have an explicit mapping
    const trelloMemberId = await getTrelloMemberFromDiscord(discordUsername);
    if (trelloMemberId) {
      console.log(`✅ Found mapped Trello member for "${discordUsername}"`);
      return trelloMemberId;
    }

    // If no explicit mapping, try to find by name
    console.log(
      `⚠️ No explicit mapping for "${discordUsername}". Trying name-based matching...`
    );

    // Extract first name if username contains a dot (e.g., "karolina.dobrzanska" -> "karolina")
    const firstName = discordUsername.split(".")[0];
    if (!firstName) return null;

    const matchingMembers = await findTrelloMembersByName(firstName);
    if (!matchingMembers || matchingMembers.length === 0) {
      console.log(`❌ No matching Trello members found for "${firstName}"`);
      return null;
    }

    // If only one match, use it
    if (matchingMembers.length === 1) {
      console.log(
        `✅ Found single matching Trello member for "${firstName}": ${
          matchingMembers[0].fullName || matchingMembers[0].username
        }`
      );
      return matchingMembers[0].id;
    }

    // If multiple matches and username contains lastname, try to find best match
    if (discordUsername.includes(".")) {
      const lastName = discordUsername.split(".")[1];

      for (const member of matchingMembers) {
        const fullName = (member.fullName || "").toLowerCase();
        if (fullName.includes(lastName)) {
          console.log(
            `✅ Found best matching Trello member for "${discordUsername}": ${
              member.fullName || member.username
            }`
          );
          return member.id;
        }
      }
    }

    // No perfect match, return first one as fallback
    console.log(
      `⚠️ No perfect match found for "${discordUsername}". Using first match: ${
        matchingMembers[0].fullName || matchingMembers[0].username
      }`
    );
    return matchingMembers[0].id;
  } catch (error) {
    console.error(
      `🚨 Error getting Trello member ID for Discord user "${discordUsername}":`,
      error
    );
    return null;
  }
}

/**
 * Extract mentioned users from Discord message content and return their Trello member IDs
 * @param {string} messageContent - The Discord message content
 * @param {object} discordClient - The Discord client for user resolution
 * @returns {Promise<string[]>} - Array of Trello member IDs
 */
export async function getMentionedTrelloMembers(messageContent, discordClient) {
  try {
    // Extract mention patterns like <@123456789>
    const mentionRegex = /<@!?(\d+)>/g;
    const mentionMatches = [...messageContent.matchAll(mentionRegex)];

    if (mentionMatches.length === 0) {
      return [];
    }

    const trelloMemberIds = [];

    // Process each mention
    for (const match of mentionMatches) {
      const userId = match[1];
      try {
        // Get the Discord user object
        const user = await discordClient.users.fetch(userId);
        if (user) {
          console.log(
            `🔍 Processing mention for Discord user: ${user.username}`
          );

          // Try to get corresponding Trello member ID
          const trelloMemberId = await getTrelloMemberIdFromDiscord(
            user.username
          );
          if (trelloMemberId) {
            trelloMemberIds.push(trelloMemberId);
          }
        }
      } catch (error) {
        console.error(
          `🚨 Error processing mention for user ID ${userId}:`,
          error
        );
      }
    }

    return trelloMemberIds;
  } catch (error) {
    console.error(`🚨 Error in getMentionedTrelloMembers:`, error);
    return [];
  }
}

/**
 * Get a Trello member ID based on the list name
 * @param {string} listName The list name to find a member for (e.g., "Aga", "Maciej")
 * @param {Object} message The Discord message for prompting if needed
 * @returns {Promise<string|null>} Trello member ID or null if not found/selected
 */
export async function getTrelloMemberIdFromListName(listName, message) {
  // If the list name is "bazowe" or empty, we don't try to find a member
  if (!listName || listName.toLowerCase() === "bazowe") {
    return null;
  }

  try {
    // Search for members matching the list name
    const matchingMembers = await findTrelloMembersByName(listName);

    if (!matchingMembers || matchingMembers.length === 0) {
      console.log(
        `⚠️ No Trello members found matching list name: "${listName}"`
      );
      return null;
    }

    // If only one match, use it directly
    if (matchingMembers.length === 1) {
      console.log(
        `✅ Found exactly one Trello member for "${listName}": ${
          matchingMembers[0].fullName || matchingMembers[0].username
        }`
      );
      return matchingMembers[0].id;
    }

    // If multiple matches, ask user to select
    console.log(
      `🤔 Found ${matchingMembers.length} possible Trello members for "${listName}", asking user to choose...`
    );

    const selectedMemberId = await askUserToSelectTrelloMember(
      message,
      listName,
      matchingMembers
    );

    if (selectedMemberId) {
      console.log(
        `✅ User selected a Trello member (ID: ${selectedMemberId}) for list "${listName}"`
      );
    } else {
      console.log(
        `⚠️ User did not select any Trello member for list "${listName}"`
      );
    }

    return selectedMemberId;
  } catch (error) {
    console.error(`🚨 Error getting Trello member from list name: ${error}`);
    return null;
  }
}
