// src/services/intelligenceExtractor.js

import { GoogleGenerativeAI } from "@google/generative-ai";
import { GEMINI_API_KEY } from "../config/env.js";

const URL_REGEX = /(https?:\/\/[^\s]+)/gi;
const UPI_REGEX = /\b[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}\b/g;
const PHONE_REGEX = /(?:\b|(?:\+91[\s-]?))[6-9]\d{9}\b/g;
const SUSPICIOUS_KEYWORDS = [
  "urgent",
  "verify now",
  "account blocked",
  "kyc",
  "suspend",
  "lapse",
  "lottery",
  "winner",
  "click here",
];

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash-lite",
  generationConfig: {
    responseMimeType: "application/json",
  },
});

export function extractIntelligence(text) {
  if (!text) return {};

  const lowerText = text.toLowerCase();
  const foundKeywords = SUSPICIOUS_KEYWORDS.filter((kw) =>
    lowerText.includes(kw)
  );

  return {
    links: text.match(URL_REGEX) || [],
    upiIds: text.match(UPI_REGEX) || [],
    phoneNumbers: text.match(PHONE_REGEX) || [],
    suspiciousKeywords: foundKeywords,
  };
}

export async function extractIntelligenceWithLLM(text) {
  if (!text) return {};
  try {
    const prompt = `
      Analyze the following message from a potential scammer and extract structured intelligence.
      Return a JSON object with this schema:
      {
        "scamType": "phishing | investment | tech_support | lottery | job | unknown",
        "riskScore": number (0-100),
        "entities": {
           "bankName": string | null,
           "upiId": string | null,
           "phoneNumber": string | null,
           "cryptoWallet": string | null,
           "url": string | null,
           "otpRequest": boolean
        },
        "intent": "What is the scammer trying to do right now?"
      }
      
      Message: "${text}"
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return JSON.parse(response.text());
  } catch (error) {
    console.error("LLM Extraction Error:", error);
    return {};
  }
}
