// utils/database.js
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import path from "path";
import fs from "fs/promises";

// Make sure the data directory exists
const dataDir = path.join(process.cwd(), "data");
try {
  await fs.mkdir(dataDir, { recursive: true });
} catch (err) {
  // Ignore if directory already exists
}

// Database file path
const dbPath = path.join(dataDir, "user_mappings.db");

// Initialize the database connection
let db;

/**
 * Initialize the database
 */
export async function initDatabase() {
  if (db) return db;

  try {
    console.log(`📂 Opening database at: ${dbPath}`);

    // Open the database
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    // Create the user mappings table if it doesn't exist
    await db.exec(`
      CREATE TABLE IF NOT EXISTS user_mappings (
        discord_username TEXT PRIMARY KEY,
        trello_username TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log("✅ Database initialized successfully");
    return db;
  } catch (error) {
    console.error("🚨 Failed to initialize database:", error);
    throw error;
  }
}

/**
 * Get all user mappings
 * @returns {Promise<Object>} Object with discord usernames as keys and trello usernames as values
 */
export async function getAllUserMappings() {
  try {
    await initDatabase();

    const rows = await db.all(
      "SELECT discord_username, trello_username FROM user_mappings"
    );

    // Convert to the same format as the old JSON file
    const mappings = {};
    rows.forEach((row) => {
      mappings[row.discord_username] = row.trello_username;
    });

    return mappings;
  } catch (error) {
    console.error("🚨 Error getting all user mappings:", error);
    return {};
  }
}

/**
 * Save all user mappings
 * @param {Object} mappings Object with discord usernames as keys and trello usernames as values
 */
export async function saveAllUserMappings(mappings) {
  try {
    await initDatabase();

    // Start a transaction
    await db.exec("BEGIN TRANSACTION");

    // Clear existing mappings
    await db.exec("DELETE FROM user_mappings");

    // Insert all mappings
    const stmt = await db.prepare(
      "INSERT INTO user_mappings (discord_username, trello_username) VALUES (?, ?)"
    );

    for (const [discordUsername, trelloUsername] of Object.entries(mappings)) {
      await stmt.run(discordUsername, trelloUsername);
    }

    await stmt.finalize();
    await db.exec("COMMIT");

    console.log(
      `✅ Saved ${Object.keys(mappings).length} user mappings to database`
    );
  } catch (error) {
    console.error("🚨 Error saving all user mappings:", error);
    // Try to roll back the transaction
    try {
      await db.exec("ROLLBACK");
    } catch (rollbackError) {
      console.error("Failed to rollback transaction:", rollbackError);
    }
    throw error;
  }
}

/**
 * Add or update a single user mapping
 * @param {string} discordUsername Discord username
 * @param {string} trelloUsername Trello username
 */
export async function saveUserMapping(discordUsername, trelloUsername) {
  try {
    await initDatabase();

    await db.run(
      `INSERT INTO user_mappings (discord_username, trello_username) 
       VALUES (?, ?)
       ON CONFLICT(discord_username) 
       DO UPDATE SET trello_username = ?, updated_at = CURRENT_TIMESTAMP`,
      discordUsername,
      trelloUsername,
      trelloUsername
    );

    console.log(
      `✅ Saved mapping: Discord ${discordUsername} → Trello ${trelloUsername}`
    );
  } catch (error) {
    console.error(
      `🚨 Error saving user mapping for ${discordUsername}:`,
      error
    );
    throw error;
  }
}

/**
 * Remove a user mapping
 * @param {string} discordUsername Discord username
 */
export async function removeUserMapping(discordUsername) {
  try {
    await initDatabase();

    const result = await db.run(
      "DELETE FROM user_mappings WHERE discord_username = ?",
      discordUsername
    );

    return result.changes > 0;
  } catch (error) {
    console.error(
      `🚨 Error removing user mapping for ${discordUsername}:`,
      error
    );
    throw error;
  }
}

/**
 * Get Trello username for a Discord user
 * @param {string} discordUsername Discord username
 * @returns {Promise<string|null>} Trello username or null if not found
 */
export async function getTrelloUsernameForDiscord(discordUsername) {
  try {
    await initDatabase();

    const row = await db.get(
      "SELECT trello_username FROM user_mappings WHERE discord_username = ?",
      discordUsername
    );

    return row ? row.trello_username : null;
  } catch (error) {
    console.error(
      `🚨 Error getting Trello username for ${discordUsername}:`,
      error
    );
    return null;
  }
}
