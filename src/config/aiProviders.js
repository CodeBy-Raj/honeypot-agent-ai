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

const TANAOS_API_KEYS = [
  process.env.TANAOS_API_KEY_1, // Primary
  process.env.TANAOS_API_KEY_2, // Backup 1
  process.env.TANAOS_API_KEY_3, // Backup 2
  process.env.TANAOS_API_KEY, // Backward compatibility
].filter(Boolean);

// Gemini as final fallback
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Track usage per key
let currentKeyIndex = 0;
let currentTanaosKeyIndex = 0;

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

export function getNextTanaosKey() {
  if (TANAOS_API_KEYS.length === 0) {
    throw new Error("No Tanaos API keys configured");
  }

  const key = TANAOS_API_KEYS[currentTanaosKeyIndex];
  currentTanaosKeyIndex =
    (currentTanaosKeyIndex + 1) % TANAOS_API_KEYS.length;

  return key;
}

export { GROQ_API_KEYS, TANAOS_API_KEYS, GEMINI_API_KEY };
