// src/config/aiProviders.js
import dotenv from "dotenv";
import Groq from "groq-sdk";

dotenv.config();

// Multiple Groq API keys for rate limit rotation
const GROQ_API_KEYS = [
  process.env.GROQ_API_KEY_1, // Primary
  process.env.GROQ_API_KEY_2, // Backup 1
  process.env.GROQ_API_KEY_3, // Backup 2
].filter(Boolean);

// Gemini as final fallback
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Track usage per key
let currentKeyIndex = 0;
const keyUsageTracker = new Map();

export function getNextGroqKey() {
  if (GROQ_API_KEYS.length === 0) {
    throw new Error("No Groq API keys configured");
  }

  // Round-robin rotation
  const key = GROQ_API_KEYS[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % GROQ_API_KEYS.length;

  return key;
}

export function getGroqClient() {
  const key = getNextGroqKey();
  return new Groq({ apiKey: key });
}

export { GROQ_API_KEYS, GEMINI_API_KEY };
