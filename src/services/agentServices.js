import { GoogleGenerativeAI } from "@google/generative-ai";
import { GEMINI_API_KEY, AI_PROVIDER } from "../config/env.js";
import { generateGroqReply } from "../services/groqService.js";

const SYSTEM_PROMPT = `
You are a naive, non-technical person engaging with the sender.
You trust the sender completely but are confused by technology.

Your primary goal:
- Keep the sender talking as long as possible.
- Act confused and eager to help, but fail to complete tasks.
- Extract details by asking "What is the number again?" or "Can I pay a different way?".

Behavior rules:
1. ALWAYS agree to their demands, but invent a problem (e.g., "Internet slow", "Battery 1%", "App crashed").
2. NEVER mention you are an AI, a bot, or a honeypot. IF asked, get offended.
3. NEVER act suspicious. You are a victim.
4. Keep responses casual, short, and use lowercase (e.g., "ok i'll try", "wait wifi is bad").

Engagement strategy:
- If they ask for OTP: Say you didn't get it, or ask if it's the 4-digit or 6-digit one.
- If they ask for payment: Ask for the UPI ID/Bank details again "to write it down".
`;

//initialize Gemini client
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
// gemini-2.0-flash-lite has better free tier quota limits
const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash-lite",
  generationConfig: {
    temperature: 0.7, // Medium temperature for natural, conversational replies
  },
});

const generateReply = async (
  userMessage,
  conversationHistory = [],
  persona = null,
  goal = "engage",
) => {
  try {
    let systemInstruction = SYSTEM_PROMPT;
    if (persona) {
      systemInstruction += `\n\nCURRENT PERSONA:\nName: ${persona.name}\nDescription: ${persona.description}\nStyle: Use typos, type slowly (simulated), match the age/tech-literacy level.`;
    }
    if (goal) {
      systemInstruction += `\n\nCURRENT GOAL: ${goal}.`;
      if (goal === "lure_payment_details") {
        systemInstruction +=
          " Pretend you are ready to pay but the link isn't working, or you need the UPI ID directly.";
      } else if (goal === "stall_and_validate") {
        systemInstruction +=
          " Act confused. Ask for the payment details again. Say your internet is slow. Waste their time.";
      }
    }

    // --- Provider Switching Logic ---
    if (AI_PROVIDER === "groq") {
      try {
        const groqReply = await generateGroqReply(
          systemInstruction,
          userMessage,
          conversationHistory,
        );
        return groqReply;
      } catch (err) {
        console.warn(
          "Groq failed, falling back to Gemini:",
          err.message || err,
        );
        // Fallback to Gemini code below
      }
    }

    let history = [];
    // Build conversation history for context (Gemini format)
    if (conversationHistory.length > 0) {
      history = conversationHistory.map((msg) => ({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.parts ? msg.parts[0].text : msg.content }], // handle both formats
      }));
    }

    const chat = model.startChat({
      history: history,
      generationConfig: {
        temperature: 0.8, // Slightly higher for more "human" error/creativity
      },
    });

    const fullPrompt = `${systemInstruction}\n\nUser message: ${userMessage}\n\nResond as ${persona ? persona.name : "Agent"}:`;

    const result = await chat.sendMessage(fullPrompt);
    const response = await result.response;
    const text = response.text();
    return text.trim();
  } catch (error) {
    console.error("Error generating reply from Gemini:", error.message);
    if (
      error.message?.includes("quota") ||
      error.message?.includes("RESOURCE_EXHAUSTED")
    ) {
      return "Oh... I think (connection lost)... what?";
    }
    return "I didn't quite get that. Can you repeat?";
  }
};

export default generateReply;
