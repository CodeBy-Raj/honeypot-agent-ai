// src/services/intelligenceExtractor.js

import { GoogleGenerativeAI } from "@google/generative-ai";
import { GEMINI_API_KEY, AI_PROVIDER } from "../config/env.js";
import { generateGroqJsonWithRetry } from "./groqServicesWithRotation.js";

const URL_REGEX = /(https?:\/\/[^\s]+)/gi;
const UPI_REGEX = /\b[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}\b/g;
const EMAIL_REGEX = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;
const PHONE_REGEX = /(?:\b|(?:\+91[\s-]?))[6-9]\d{9}\b/g;
const BANK_ACCOUNT_REGEX = /\b\d{11,20}\b/g;
const BANK_NAME_GENERIC_REGEX =
  /\b(?:SBI|HDFC|ICICI|AXIS|PNB|KOTAK|YES\s+BANK|IDFC(?:\s+FIRST\s+BANK)?|CANARA\s+BANK|INDUSIND\s+BANK|BANK\s+OF\s+BARODA|PUNJAB\s+NATIONAL\s+BANK|UNION\s+BANK|STATE\s+BANK\s+OF\s+INDIA)\b/gi;
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
  if (!text)
    return {
      phishingLinks: [],
      upiIds: [],
      phoneNumbers: [],
      bankAccounts: [],
      emailAddresses: [],
      suspiciousKeywords: [],
    };

  const lowerText = text.toLowerCase();
  const foundKeywords = SUSPICIOUS_KEYWORDS.filter((kw) =>
    lowerText.includes(kw),
  );

  return {
    phishingLinks: text.match(URL_REGEX) || [],
    upiIds: text.match(UPI_REGEX) || [],
    emailAddresses: text.match(EMAIL_REGEX) || [],
    phoneNumbers: text.match(PHONE_REGEX) || [],
    bankAccounts: [
      ...(text.match(BANK_ACCOUNT_REGEX) || []),
      ...(text.match(BANK_NAME_GENERIC_REGEX) || []),
    ],
    suspiciousKeywords: foundKeywords,
  };
}

export async function extractIntelligenceWithLLM(text) {
  if (!text) return {};

  const prompt = `
      Analyze the following message from a potential scammer and extract structured intelligence.
      Return a JSON object with this schema:
      {
        "scamType": "phishing | investment | tech_support | lottery | job | unknown",
        "riskScore": number (0-100),
        "suspiciousKeywords": string[],
        "entities": {
           "bankName": string | null,
           "bankAccountNumber": string | null,
           "upiId": string | null,
           "phoneNumber": string | null,
           "emailAddress": string | null,
           "cryptoWallet": string | null,
           "url": string | null,
           "otpRequest": boolean
        },
        "intent": "What is the scammer trying to do right now?"
      }

      Rules:
      - Only set bankAccountNumber when message explicitly mentions account context (account / a-c / acct / bank account).
      - Never place phone numbers in bankAccountNumber.
      - bankName must be an institution name, not a generic phrase like "my bank".
      - If uncertain, return null for that field.
      
      Message: "${text}"
    `;

  // 1. Try Groq if enabled (preferred for speed)
  if (AI_PROVIDER === "groq") {
    try {
      return await generateGroqJsonWithRetry(prompt);
    } catch (e) {
      console.warn(
        "Groq Extraction Failed, falling back to Gemini:",
        e.message || e,
      );
    }
  }

  // 2. Fallback to Gemini
  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return JSON.parse(response.text());
  } catch (error) {
    console.error("LLM Extraction Error (Gemini):", error);
    return {};
  }
}
