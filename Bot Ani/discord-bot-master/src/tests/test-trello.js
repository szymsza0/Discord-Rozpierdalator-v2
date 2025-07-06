import dotenv from "dotenv";
import fetch from "node-fetch";
dotenv.config();

const TRELLO_API_BASE = "https://api.trello.com/1";
const TRELLO_KEY = process.env.TRELLO_KEY;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN;

async function testTrelloConnection() {
  try {
    const response = await fetch(
      `${TRELLO_API_BASE}/members/me/boards?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`
    );

    const data = await response.json();

    if (response.ok) {
      data.forEach((board) => {
        console.log(`- ${board.name} (ID: ${board.id})`);
      });
    } else {
      console.error("\n❌ Error response from Trello:");
      console.error(data);
    }
  } catch (error) {
    console.error("\n❌ Error occurred:");
    console.error("Type:", error.constructor.name);
    console.error("Message:", error.message);
  }
}

testTrelloConnection();
