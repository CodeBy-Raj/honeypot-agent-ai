// src/services/groqServiceWithRotation.js

import Groq from "groq-sdk";
import { getNextGroqKey } from "../config/aiProviders.js";

/**
 * Generate JSON with automatic key rotation on rate limit
 */
export async function generateGroqJsonWithRetry(prompt, maxRetries = 3) {
  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const apiKey = getNextGroqKey();
      const groq = new Groq({ apiKey });

      const chatCompletion = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "llama-3.1-8b-instant",
        temperature: 0.1,
        response_format: { type: "json_object" },
      });

      return JSON.parse(chatCompletion.choices[0]?.message?.content || "{}");
    } catch (error) {
      lastError = error;

      // Check if it's a rate limit error
      if (error.status === 429 || error.message?.includes("rate limit")) {
        console.warn(
          `Groq rate limit hit, rotating key (attempt ${attempt + 1}/${maxRetries})`,
        );

        // Wait briefly before trying next key
        await new Promise((resolve) => setTimeout(resolve, 500));
        continue;
      }

      // For other errors, throw immediately
      throw error;
    }
  }

  // All keys exhausted, throw the last error
  throw lastError;
}

/**
 * Generate plain text reply with automatic key rotation on rate limit
 * @param {string} systemPrompt - System prompt to set context
 * @param {string} userMessage - User's last message
 * @param {Array} conversationHistory - Previous messages [{role: 'user'|'assistant', content: '...'}]
 * @param {number} maxRetries - Number of retries on rate limit (default: 3)
 * @returns {Promise<string>} - Generated plain text response
 */
export async function generateGroqReplyWithRetry(
  systemPrompt,
  userMessage,
  conversationHistory = [],
  temperature = 0.7,
  maxRetries = 3,
) {
  let lastError;
  const messages = [
    { role: "system", content: systemPrompt },
    ...conversationHistory,
    { role: "user", content: userMessage },
  ];

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const apiKey = getNextGroqKey();
      const groq = new Groq({ apiKey });

      const chatCompletion = await groq.chat.completions.create({
        messages: messages,
        model: "llama-3.1-8b-instant",
        temperature: temperature,
      });

      return chatCompletion.choices[0]?.message?.content || "";
    } catch (error) {
      lastError = error;

      // Check if it's a rate limit error
      if (
        error &&
        (error.status === 429 ||
          (error.message && error.message.includes("rate limit")))
      ) {
        console.warn(
          `Groq rate limit hit (text), rotating key (attempt ${attempt + 1}/${maxRetries})`,
        );

        // Wait briefly before trying next key
        await new Promise((resolve) => setTimeout(resolve, 500));
        continue;
      }

      // For other errors, throw immediately
      throw error;
    }
  }

  // All keys exhausted, throw the last error
  throw lastError;
}
