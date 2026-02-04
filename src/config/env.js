import dotenv from 'dotenv';

dotenv.config();

export const PORT=process.env.PORT;
export const API_KEY=process.env.API_KEY;
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
export const TANAOS_API_KEY= process.env.TANAOS_API_KEY;