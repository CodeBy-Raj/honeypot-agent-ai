// src/services/intelligenceExtractor.js

import { GoogleGenerativeAI } from "@google/generative-ai";
import { GEMINI_API_KEY, AI_PROVIDER } from "../config/env.js";
import { generateGroqJsonWithRetry } from "./groqServicesWithRotation.js";

const PATTERNS = {
  phone: [
    /\+?91[-\s]?\d{5}[-\s]?\d{5}/g,
    /\+?91[-\s]?\d{4}[-\s]?\d{3}[-\s]?\d{3}/g,
    /\+?91[-\s]?\(?\d{3}\)?[-\s]?\d{3}[-\s]?\d{4}/g,
    /(?<!Rs\.?\s?)\b[6-9]\d{9}\b/g,
  ],
  upi: [
    /\b[a-zA-Z0-9._-]+@(?:paytm|phonepe|gpay|ybl|oksbi|okaxis|okicici|upi|federal|ibl|kotak|dbs|sbi|axis|icici|hdfc|yesbank|rbl|barodampay|fakeupi|payhub|fakebank)(?:\.[a-zA-Z0-9.-]+)?\b/gi,
  ],
  bank: [/\b\d{11,18}\b/g],
  url: [/https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi],
  email: [/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g],
};

function isPhoneLikeDigits(value = "") {
  const normalized = String(value || "").trim();
  return /^(?:91)?[6-9]\d{9}$/.test(normalized);
}

function extractWithPatterns(text, patterns = [], transform = (v) => v) {
  const results = new Set();
  for (const pattern of patterns) {
    const matches = text.match(pattern) || [];
    matches.forEach((match) => results.add(transform(match)));
  }
  return Array.from(results).filter(Boolean);
}

function extractPhoneNumbers(text = "") {
  const extracted = extractWithPatterns(text, PATTERNS.phone, (value) =>
    String(value || "").trim(),
  );

  const withPrefix = [];
  const standalone = [];

  for (const num of extracted) {
    const compact = num.replace(/[\s-]/g, "");
    if (compact.startsWith("+91") || compact.startsWith("91")) {
      withPrefix.push(num);
    } else {
      standalone.push(num);
    }
  }

  const final = [...withPrefix];
  for (const num of standalone) {
    const compactNum = num.replace(/[\s-]/g, "");
    const hasPrefixedEquivalent = withPrefix.some((prefixed) => {
      const compactPrefixed = prefixed
        .replace(/[\s-]/g, "")
        .replace(/^\+?91/, "");
      return compactPrefixed === compactNum;
    });

    if (!hasPrefixedEquivalent) {
      final.push(num);
    }
  }

  return final;
}

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
    };

  const bankAccountCandidates = extractWithPatterns(text, PATTERNS.bank).filter(
    (candidate) => !isPhoneLikeDigits(candidate),
  );

  return {
    phishingLinks: extractWithPatterns(text, PATTERNS.url),
    upiIds: extractWithPatterns(text, PATTERNS.upi, (value) =>
      String(value || "").toLowerCase(),
    ),
    emailAddresses: extractWithPatterns(text, PATTERNS.email, (value) =>
      String(value || "").toLowerCase(),
    ),
    phoneNumbers: extractPhoneNumbers(text),
    bankAccounts: bankAccountCandidates,
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
        "entities": {
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
      - bankAccountNumber must be numeric-only (9-20 digits), with no plus sign and no dashes.
      - Only set bankAccountNumber when message explicitly mentions account context (account / a-c / acct / bank account).
      - Never place phone numbers in bankAccountNumber.
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
