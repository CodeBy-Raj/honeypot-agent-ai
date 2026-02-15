// src/services/groqService.js
import Groq from "groq-sdk";
import { GROQ_API_KEY_1 } from "../config/env.js";

let groq;

try {
  if (GROQ_API_KEY_1) {
    groq = new Groq({ apiKey: GROQ_API_KEY_1 });
  }
} catch (error) {
  console.error("Groq initialization failed:", error);
}

export const generateGroqReply = async (
  systemPrompt,
  userMessage,
  conversationHistory = [],
) => {
  if (!groq) {
    throw new Error("GROQ_API_KEY_1 is missing via env variables");
  }

  // Convert internal history format to Groq/OpenAI format
  // Internal: [{ role: 'user', parts: [{ text: '...' }] }]
  // Groq: [{ role: 'user', content: '...' }]
  const messages = [
    { role: "system", content: systemPrompt },
    ...conversationHistory.map((msg) => ({
      role: msg.role === "model" ? "assistant" : "user",
      content: msg.parts[0].text,
    })),
    { role: "user", content: userMessage },
  ];

  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: messages,
      model: "llama-3.3-70b-versatile",
      temperature: 0.7,
      max_tokens: 150,
    });

    return chatCompletion.choices[0]?.message?.content || "";
  } catch (error) {
    console.error("Groq API Error:", error);
    throw error;
  }
};

export const generateGroqJson = async (prompt) => {
  if (!groq) {
    throw new Error("GROQ_API_KEY_1 is missing");
  }

  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "llama-3.1-8b-instant",
      temperature: 0.1,
      response_format: { type: "json_object" },
    });

    return JSON.parse(chatCompletion.choices[0]?.message?.content || "{}");
  } catch (error) {
    console.error("Groq JSON Error:", error);
    throw error;
  }
};
