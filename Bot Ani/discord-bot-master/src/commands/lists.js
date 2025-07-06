import { fetchBoards, fetchTrelloLists } from "../utils/trello.js";
import { EmbedBuilder } from "discord.js";

export async function executeLists(message) {
  try {
    const processingMsg = await message.reply({
      embeds: [
        new EmbedBuilder().setColor("#0079BF").setDescription("🔄 Szukam..."),
      ],
    });

    const boards = await fetchBoards();

    for (const board of boards) {
      const lists = await fetchTrelloLists(board.id);

      const chunkSize = 25;
      for (let i = 0; i < lists.length; i += chunkSize) {
        const chunk = lists.slice(i, i + chunkSize);

        const embed = new EmbedBuilder()
          .setColor("#0079BF")
          .setTitle(`📌 ${board.name} (Page ${Math.floor(i / chunkSize) + 1})`)
          .addFields(
            chunk.map((list) => ({
              name: `📋 ${list.name}`,
              value: list.cards
                ? list.cards
                    .map(
                      (card) =>
                        `> • ${card.name}\n` +
                        (card.due
                          ? `> ⏰ Deadline: ${new Date(
                              card.due
                            ).toLocaleDateString()}\n`
                          : "") +
                        (card.desc ? `> 📝 ${card.desc}\n` : "")
                    )
                    .join("\n")
                : "*No cards*",
            }))
          )
          .setFooter({ text: "Last updated" })
          .setTimestamp();

        await message.channel.send({ embeds: [embed] });
      }
    }

    await processingMsg.delete();
  } catch (error) {
    console.error("Error:", error);
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor("#FF0000")
          .setDescription("❌ Error fetching lists."),
      ],
    });
  }
}
