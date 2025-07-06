import { fetchBoards } from "../utils/trello.js";
import { EmbedBuilder } from "discord.js";

export async function executeBoards(message) {
  try {
    const boards = await fetchBoards();

    if (!boards || boards.length === 0) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setDescription(
              "🚫 Brak tablic w dozwolonej przestrzeni roboczej."
            ),
        ],
      });
    }

    // ❌ Filter out closed boards
    const openBoards = boards.filter((b) => !b.closed);

    if (openBoards.length === 0) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#FFA500")
            .setDescription(
              "⚠️ Wszystkie tablice są zamknięte. Nie można na nich tworzyć zadań."
            ),
        ],
      });
    }

    const boardList = openBoards.map((b) => `🔹 **${b.name}**`).join("\n");

    const embed = new EmbedBuilder()
      .setColor("#0079BF")
      .setTitle("📌 Twoje dostępne tablice:")
      .setDescription(boardList)
      .setFooter({ text: "Tablice zamknięte zostały ukryte." });

    return message.reply({ embeds: [embed] });
  } catch (error) {
    console.error("🚨 Error executing !boards:", error);

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor("#FF0000")
          .setDescription(
            "🚨 Wystąpił błąd podczas pobierania tablic. Spróbuj ponownie później."
          ),
      ],
    });
  }
}
