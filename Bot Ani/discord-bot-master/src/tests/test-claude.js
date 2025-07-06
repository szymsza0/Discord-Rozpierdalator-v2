import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
dotenv.config();

async function testClaudeConnection() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("❌ Error: ANTHROPIC_API_KEY not found in .env file");
    return;
  }

  try {
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const message = await anthropic.messages.create({
      model: "claude-3-7-sonnet-20250219",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: "Say 'Test claude successful!' if you can read this.",
        },
      ],
    });

    console.log("Claude's response:", message.content);
  } catch (error) {
    console.error("\n❌ Error occurred:");
    console.error("Type:", error.constructor.name);
    console.error("Message:", error.message);
    if (error.status) {
      console.error("Status:", error.status);
    }
  }
}

testClaudeConnection();
