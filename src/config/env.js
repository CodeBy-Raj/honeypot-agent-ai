import dotenv from "dotenv";

dotenv.config();

export const PORT = process.env.PORT;
export const API_KEY = process.env.API_KEY;
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
export const TANAOS_API_KEY = process.env.TANAOS_API_KEY;
export const GROQ_API_KEY_1 = process.env.GROQ_API_KEY_1;
export const GROQ_API_KEY_2 = process.env.GROQ_API_KEY_2;
export const GROQ_API_KEY_3 = process.env.GROQ_API_KEY_3;
export const AI_PROVIDER = process.env.AI_PROVIDER || "groq"; // Default to Groq for speed
