/**
 * Calculate Levenshtein distance between two strings
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} - Distance score (lower means more similar)
 */
import { EmbedBuilder } from "discord.js";
import {
  TRELLO_API_BASE,
  TRELLO_KEY,
  TRELLO_TOKEN,
  ALLOWED_GUILD_ID,
} from "../config.js";

import { getBoardIdByName } from "../utils/trello.js";

function levenshteinDistance(a, b) {
  // Convert to strings and clean input
  a = String(a).toLowerCase();
  b = String(b).toLowerCase();

  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];

  // Initialize matrix
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Find boards with names very similar to the requested one
 * @param {string} requestedName - The board name being searched for
 * @param {Array} allBoards - All available boards to search in
 * @returns {Array} - List of boards that are likely matches
 */
function findAlmostMatchingBoards(requestedName, allBoards) {
  // Clean the requested name
  const cleanRequestedName = requestedName
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\w\d]/g, ""); // Remove non-alphanumeric chars

  return allBoards
    .filter((board) => {
      // Skip closed boards
      if (board.closed) return false;

      // Clean the board name for comparison
      const cleanBoardName = board.name
        .toLowerCase()
        .replace(/\s+/g, "")
        .replace(/[^\w\d]/g, "");

      // Get normalized version without prefixes
      const normalizedBoardName = board.name
        .replace(/^\s*\[[^\]]+\]\s*\d+\s*-\s*/, "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "")
        .replace(/[^\w\d]/g, "");

      // Very similar if:
      // 1. Almost identical (<=2 char difference)
      const isVerySimilar =
        levenshteinDistance(cleanBoardName, cleanRequestedName) <= 2 ||
        levenshteinDistance(normalizedBoardName, cleanRequestedName) <= 2;

      // 2. One contains the other almost completely
      const containsOther =
        cleanBoardName.includes(cleanRequestedName) ||
        cleanRequestedName.includes(cleanBoardName) ||
        normalizedBoardName.includes(cleanRequestedName) ||
        cleanRequestedName.includes(normalizedBoardName);

      // 3. Check if one is a subset of the other with words in different order
      const boardWords = board.name.toLowerCase().split(/\s+/);
      const requestWords = requestedName.toLowerCase().split(/\s+/);

      // Count how many words match between the two names
      const matchingWords = boardWords.filter((boardWord) =>
        requestWords.some(
          (requestWord) =>
            boardWord.includes(requestWord) ||
            requestWord.includes(boardWord) ||
            levenshteinDistance(boardWord, requestWord) <= 1
        )
      ).length;

      // Calculate match percentage for word matching
      const matchPercentage =
        matchingWords / Math.max(boardWords.length, requestWords.length);

      // Very similar if at least 70% of words match
      const wordSimilarityMatch = matchPercentage >= 0.7;

      return isVerySimilar || containsOther || wordSimilarityMatch;
    })
    .map((board) => ({
      id: board.id,
      name: board.name,
    }));
}

/**
 * Gets board ID by name with improved handling for similar names and user selection
 * @param {string} boardName - The board name to search for
 * @param {object} message - The Discord message object for interaction
 * @param {object} processingMsg - The processing message to update
 * @returns {Promise<string|null>} - The board ID or null if not found/cancelled
 */
export async function getBoardIdWithConfirmation(
  boardName,
  message,
  processingMsg
) {
  try {
    // First attempt exact match
    const exactBoardResult = await getBoardIdByName(boardName, true); // Add 'exactMatch' parameter to existing function

    if (exactBoardResult && !exactBoardResult.multiple) {
      // We found exact match, no confirmation needed
      console.log(`✅ Found exact board match: "${boardName}"`);
      return exactBoardResult;
    }

    if (exactBoardResult && exactBoardResult.multiple) {
      // Multiple exact matches found, show selection
      const boardOptions = exactBoardResult.boards
        .map((b, index) => `**${index + 1}.** ${b.name}`)
        .join("\n");

      await processingMsg.edit({
        embeds: [
          new EmbedBuilder()
            .setColor("#FFA500")
            .setTitle("🔍 Wybierz tablicę")
            .setDescription(
              `Znaleziono kilka tablic pasujących do "${boardName}". Wybierz numer:\n\n${boardOptions}\n\n_Proszę odpowiedzieć, podając numer tablicy._`
            ),
        ],
      });

      return handleBoardSelection(
        exactBoardResult.boards,
        message,
        processingMsg
      );
    }

    // No exact match, try to find similar boards
    // First get all boards
    const response = await fetch(
      `${TRELLO_API_BASE}/organizations/${ALLOWED_GUILD_ID}/boards?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`
    );

    if (!response.ok) {
      console.error(`Failed to fetch boards: ${response.status}`);
      return null;
    }

    const allBoards = await response.json();
    const activeBoards = allBoards.filter((board) => !board.closed);

    // Try to find similar boards
    const similarBoards = findAlmostMatchingBoards(boardName, activeBoards);

    if (similarBoards.length === 0) {
      // No similar boards found
      await processingMsg.edit({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setDescription(
              `❌ **Nie znaleziono żadnej tablicy podobnej do "${boardName}"**\n\nProszę spróbować ponownie z poprawną nazwą tablicy.`
            ),
        ],
      });
      return null;
    }

    // Display the similar boards as a numbered list
    const boardOptions = similarBoards
      .map((b, index) => `**${index + 1}.** ${b.name}`)
      .join("\n");

    await processingMsg.edit({
      embeds: [
        new EmbedBuilder()
          .setColor("#FFA500")
          .setTitle("🔍 Czy chodziło Ci o którąś z tych tablic?")
          .setDescription(
            `Nie znaleziono dokładnego dopasowania dla "${boardName}", ale znaleziono podobne tablice. Wybierz numer:\n\n${boardOptions}\n\n_Proszę odpowiedzieć, podając numer tablicy._`
          ),
      ],
    });

    return handleBoardSelection(similarBoards, message, processingMsg);
  } catch (error) {
    console.error("🚨 Error in getBoardIdWithConfirmation:", error);
    return null;
  }
}

/**
 * Helper function to handle user board selection from numbered list
 * @param {Array} boards - Array of board objects with id and name
 * @param {object} message - The Discord message object
 * @param {object} processingMsg - The processing message to update
 * @returns {Promise<string|null>} Board ID or null if cancelled/timeout
 */
async function handleBoardSelection(boards, message, processingMsg) {
  const filter = (response) => {
    if (response.author.id !== message.author.id) return false;

    const content = response.content.trim();
    const match = content.match(/^(\d+)\.?$/);

    if (!match) return false;

    const num = parseInt(match[1], 10);
    return num > 0 && num <= boards.length;
  };

  try {
    const collected = await message.channel.awaitMessages({
      filter,
      max: 1,
      time: 30000,
      errors: ["time"],
    });

    const selectedNumber = parseInt(
      collected.first().content.trim().replace(".", ""),
      10
    );

    const selectedBoard = boards[selectedNumber - 1];

    // Try to delete the user's selection message to keep chat clean
    try {
      await collected.first().delete();
    } catch (err) {
      console.warn("⚠️ Could not delete user selection message:", err);
    }

    await message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor("#00FF00")
          .setDescription(`✅ Wybrano tablicę: **${selectedBoard.name}**`),
      ],
    });

    return selectedBoard.id;
  } catch (error) {
    console.warn("⚠️ User did not respond in time.");

    await processingMsg.edit({
      embeds: [
        new EmbedBuilder()
          .setColor("#FF0000")
          .setDescription("⏳ **Czas minął :( ** Nie dokonano wyboru tablicy."),
      ],
    });

    return null;
  }
}

/**
 * Find similar board names based on advanced fuzzy matching
 * @param {Array} items - Array of objects with name and id properties
 * @param {string} searchTerm - The name to search for
 * @param {number} maxDistance - Maximum Levenshtein distance to consider (default: 5)
 * @returns {Array} - Array of matching items
 */
export function findSimilarNames(items, searchTerm, maxDistance = 5) {
  // Clean the search term for comparison
  const cleanSearchTerm = searchTerm.toLowerCase().replace(/\s+/g, "");

  // For each item, calculate similarity score and filter out poor matches
  const scoredItems = items
    .map((item) => {
      // Clean the normalized name for better matching
      const cleanName = (item.normalizedName || item.name)
        .toLowerCase()
        .replace(/\s+/g, "");

      // Calculate Levenshtein distance
      const distance = levenshteinDistance(cleanName, cleanSearchTerm);

      // Create weighted score based on:
      // 1. Levenshtein distance
      // 2. Whether one name contains the other
      // 3. Length similarity

      let score = 10 - distance; // Base score from edit distance

      // Boost score if one name contains the other
      if (
        cleanName.includes(cleanSearchTerm) ||
        cleanSearchTerm.includes(cleanName)
      ) {
        score += 5;
      }

      // Boost score if length is similar (penalize big differences)
      const lengthDiff = Math.abs(cleanName.length - cleanSearchTerm.length);
      if (lengthDiff <= 3) {
        score += 3;
      }

      // Check for word-level similarity
      const itemWords = item.normalizedName.toLowerCase().split(/\s+/);
      const searchWords = searchTerm.toLowerCase().split(/\s+/);

      // Count matching words
      const matchingWords = itemWords.filter((word) =>
        searchWords.some(
          (searchWord) =>
            word.includes(searchWord) ||
            searchWord.includes(word) ||
            levenshteinDistance(word, searchWord) <= 2
        )
      ).length;

      // Boost score based on word-level matches
      if (matchingWords > 0) {
        score += matchingWords * 2;
      }

      return {
        ...item,
        distance,
        score,
      };
    })
    .filter(
      (item) =>
        // Keep items with good scores
        item.score > 8 ||
        // Or close distance
        item.distance <= maxDistance ||
        // Or containing each other
        item.normalizedName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        searchTerm.toLowerCase().includes(item.normalizedName.toLowerCase())
    )
    .sort((a, b) => b.score - a.score); // Sort by score (highest first)

  // Return top matches (limit to 5 to avoid overwhelmingly long lists)
  return scoredItems.slice(0, 5);
}
