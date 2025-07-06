import fetch from "node-fetch";
import Anthropic from "@anthropic-ai/sdk";
import { EmbedBuilder } from "discord.js";
import {
  ANTHROPIC_API_KEY,
  TRELLO_API_BASE,
  TRELLO_KEY,
  TRELLO_TOKEN,
  ALLOWED_GUILD_ID,
} from "../config.js";
import { getTrelloMemberIdFromDiscord } from "../utils/userMapping.js";
import { getTrelloUsernameForDiscord } from "../utils/database.js";
import dayjs from "dayjs";
import "dayjs/locale/pl.js";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale("pl");
dayjs.tz.setDefault("Europe/Warsaw");

const anthropic = new Anthropic({
  apiKey: ANTHROPIC_API_KEY,
});

// Fixed board ID and list ID as specified
const FIXED_BOARD_ID = "6787b643fbb8cd2a8fe96639";
const FIXED_LIST_ID = "67a0bafc737bad86ea037ccd";

/**
 * Get the "Najnowsze" card from the specified list
 * @returns {Promise<object|null>} - The Najnowsze card object or null if not found
 */
async function getNajnowszeCard() {
  try {
    // Get all cards in the fixed list
    const url = `${TRELLO_API_BASE}/lists/${FIXED_LIST_ID}/cards?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to get cards: ${response.status}`);
    }

    const cards = await response.json();

    // Find the "Najnowsze" card (case insensitive)
    const najnowszeCard = cards.find(
      (card) => card.name.toLowerCase() === "najnowsze"
    );

    if (!najnowszeCard) {
      return null;
    }

    return najnowszeCard;
  } catch (error) {
    console.error("Error getting Najnowsze card:", error);
    throw error;
  }
}
/**
 * Add a lesson to the "Najnowsze" card with modified formatting
 * @param {string} cardId - The Trello card ID
 * @param {string} trelloUsername - The Trello username of the author
 * @param {string} content - The lesson content
 * @returns {Promise<boolean>} - True if successful
 */
async function addLessonToCard(cardId, trelloUsername, content) {
  try {
    // First get current card description
    const getUrl = `${TRELLO_API_BASE}/cards/${cardId}?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`;
    const getResponse = await fetch(getUrl);

    if (!getResponse.ok) {
      throw new Error(`Failed to get card: ${getResponse.status}`);
    }

    const card = await getResponse.json();

    // Format the new content with modified date format (DD.MM.YY) and
    // move the username to the end in parentheses
    const timestamp = dayjs().format("DD.MM.YY");
    const newLine = `- ${content} (${timestamp}, ${trelloUsername})`;

    // Append to existing description or create new
    let updatedDesc;
    if (card.desc && card.desc.trim()) {
      // Add new line at the beginning of the description
      updatedDesc = `${newLine}\n${card.desc}`;
    } else {
      updatedDesc = newLine;
    }

    // Update the card description
    const updateUrl = `${TRELLO_API_BASE}/cards/${cardId}?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`;
    const updateResponse = await fetch(updateUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        desc: updatedDesc,
      }),
    });

    if (!updateResponse.ok) {
      throw new Error(`Failed to update card: ${updateResponse.status}`);
    }

    return true;
  } catch (error) {
    console.error("Error adding lesson to card:", error);
    throw error;
  }
}

/**
 * Main function to process the !lekcje command
 * Format: !lekcje lesson_content
 */
export async function processLekcjeCommand(message) {
  try {
    // Extract command input - everything after !lekcje
    const content = message.content.slice("!lekcje".length).trim();

    // Check if input is provided
    if (!content) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setDescription("❌ Użycie: !lekcje treść_lekcji"),
        ],
      });
    }

    // Send processing message
    const processingMsg = await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor("#0079BF")
          .setDescription("⏳ Przetwarzanie lekcji..."),
      ],
    });

    // Get board details to ensure it's valid
    const boardDetailsUrl = `${TRELLO_API_BASE}/boards/${FIXED_BOARD_ID}?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`;
    const boardResponse = await fetch(boardDetailsUrl);

    if (!boardResponse.ok) {
      return processingMsg.edit({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setDescription(
              "❌ Nie udało się uzyskać dostępu do tablicy. Sprawdź, czy istnieje i czy masz odpowiednie uprawnienia."
            ),
        ],
      });
    }

    const boardDetails = await boardResponse.json();

    // Check if board is not closed
    if (boardDetails.closed) {
      return processingMsg.edit({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setDescription(
              `🚨 Tablica "${boardDetails.name}" jest zamknięta i nie może być aktualizowana.`
            ),
        ],
      });
    }

    // Find the "Najnowsze" card using fixed list ID
    const najnowszeCard = await getNajnowszeCard();

    if (!najnowszeCard) {
      return processingMsg.edit({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setDescription(
              `❌ Nie znaleziono karty o nazwie "Najnowsze" na liście.`
            ),
        ],
      });
    }

    // Get the user's Discord username
    const discordUsername = message.author.username;

    // Get the user's Trello username from database
    const trelloUsername = await getTrelloUsernameForDiscord(discordUsername);

    if (!trelloUsername) {
      return processingMsg.edit({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setDescription(
              "❌ Nie znaleziono połączonego konta Trello. Użyj komendy !connect, aby połączyć swoje konto Discord z Trello."
            ),
        ],
      });
    }

    // Get Trello member ID and full details
    const memberUrl = `${TRELLO_API_BASE}/members/${trelloUsername}?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`;
    const memberResponse = await fetch(memberUrl);

    if (!memberResponse.ok) {
      throw new Error(`Failed to get member details: ${memberResponse.status}`);
    }

    const memberData = await memberResponse.json();
    const trelloDisplayName = memberData.fullName || memberData.username;

    // Add the lesson to the card
    await addLessonToCard(najnowszeCard.id, trelloDisplayName, content);

    // Return success message
    return processingMsg.edit({
      embeds: [
        new EmbedBuilder()
          .setColor("#00FF00")
          .setTitle("🎊 Lekcja Dodana")
          .addFields([
            {
              name: "Autor",
              value: trelloDisplayName,
              inline: true,
            },
            {
              name: "Treść",
              value: content,
            },
            {
              name: "Zobacz w Trello",
              value: `[Kliknij tutaj, aby otworzyć kartę](${najnowszeCard.url})`,
            },
          ]),
      ],
    });
  } catch (error) {
    console.error("Error processing lekcje command:", error);

    try {
      // Try to send error message
      if (typeof message.editReply === "function") {
        // Check if it's an interaction
        return message.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor("#FF0000")
              .setDescription(`❌ Wystąpił błąd: ${error.message}`),
          ],
        });
      } else {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor("#FF0000")
              .setDescription(`❌ Wystąpił błąd: ${error.message}`),
          ],
        });
      }
    } catch (replyError) {
      console.error("Failed to send error message:", replyError);
    }
  }
}
