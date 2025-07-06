import { fetchBoards, fetchTrelloLists } from "../utils/trello.js";
import fetch from "node-fetch";
import { TRELLO_API_BASE, TRELLO_KEY, TRELLO_TOKEN } from "../config.js";
import { EmbedBuilder } from "discord.js";

async function getTasksByPerson(personName) {
  try {
    const boards = await fetchBoards();
    let allTasks = [];
    for (const board of boards) {
      const lists = await fetchTrelloLists(board.id);

      const personList = lists.find((l) =>
        l.name.toLowerCase().includes(personName.toLowerCase())
      );

      if (personList) {
        const response = await fetch(
          `${TRELLO_API_BASE}/lists/${personList.id}/cards?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`
        );
        if (!response.ok)
          throw new Error(`Failed to fetch cards for list ${personList.name}`);

        const cards = await response.json();
        allTasks.push({
          project: board.name,
          tasks: cards.map((card) => ({
            name: card.name,
            due: card.due
              ? new Date(card.due).toLocaleDateString()
              : "brak deadline'u",
            url: card.url,
          })),
        });
      }
    }
    return allTasks;
  } catch (error) {
    console.error("Błąd pobierania tasków dla:", error);
    throw error;
  }
}

export async function executeList(message) {
  const personName = message.content.slice(6).trim();
  if (!personName) {
    return message.reply({
      embeds: [
        new EmbedBuilder().setColor("#FF0000").setDescription("Podaj imię"),
      ],
    });
  }

  try {
    const processingMsg = await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor("#0079BF")
          .setDescription(`Pobieram taski dla ${personName}...`),
      ],
    });

    const tasksByProject = await getTasksByPerson(personName);
    if (tasksByProject.length === 0) {
      return processingMsg.edit({
        embeds: [
          new EmbedBuilder()
            .setColor("#FFA500")
            .setDescription(`Nie znalazłem tasków dla ${personName}`),
        ],
      });
    }

    for (const project of tasksByProject) {
      const embedChunks = [];
      let currentEmbed = new EmbedBuilder()
        .setColor("#0079BF")
        .setTitle(`Taski dla ${personName}`);

      project.tasks.forEach((task, index) => {
        if (index % 25 === 0 && index !== 0) {
          embedChunks.push(currentEmbed);
          currentEmbed = new EmbedBuilder()
            .setColor("#0079BF")
            .setTitle(
              `Taski dla ${personName} - Strona ${embedChunks.length + 1}`
            );
        }

        currentEmbed.addFields({
          name: `📎 ${task.name}`,
          value: `**Deadline:** ${task.due}\n[🔗 Zobacz w Trello](${task.url})`,
        });
      });

      if (currentEmbed.data.fields?.length) {
        embedChunks.push(currentEmbed);
      }

      for (const embed of embedChunks) {
        await message.channel.send({ embeds: [embed] });
      }
    }

    await processingMsg.delete();
  } catch (error) {
    console.error("Error:", error);
    message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor("#FF0000")
          .setDescription("Błąd pobierania tasków"),
      ],
    });
  }
}
