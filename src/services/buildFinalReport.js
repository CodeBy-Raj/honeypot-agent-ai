import { getStats } from "./sessionStats.js";
import { getIntelligence } from "./intelligenceStore.js";
import {
  getSessionMeta,
  getSession,
  getEngagementDurationSeconds,
} from "./sessionStore.js";
import { generateGroqJsonWithRetry } from "./groqServicesWithRotation.js";

/**
 * Extract text from message (handles both formats)
 * Format 1: {role, content} - Simple format
 * Format 2: {role, parts: [{text}]} - Gemini format
 */
function getMessageText(msg) {
  if (msg.parts && msg.parts[0]?.text) {
    return msg.parts[0].text;
  }
  return msg.content || "";
}

/**
 * Get role name (normalize 'model' to 'assistant')
 */
function getRoleName(msg) {
  if (msg.role === "model") return "Bot";
  if (msg.role === "assistant") return "Bot";
  if (msg.role === "user") return "Victim";
  if (msg.sender === "scammer") return "Scammer";
  return msg.role || "Unknown";
}

const buildFinalReport = async (sessionId, options = {}) => {
  const intelligence = getIntelligence(sessionId);
  const stats = getStats(sessionId);
  const meta = getSessionMeta(sessionId);
  const history = getSession(sessionId) || [];
  const endTime =
    typeof options.endTime === "number" ? options.endTime : Date.now();

  // Generate Rules-Based Fallback Summary (instant, no API)
  const noteParts = [];
  noteParts.push(`Detected ${meta?.scamType || "potential"} scam attempt.`);
  noteParts.push(`Agent engaged for ${stats?.messages || 0} turns.`);

  const hasIntel =
    (intelligence?.upiIds?.length || 0) > 0 ||
    (intelligence?.phishingLinks?.length || 0) > 0 ||
    (intelligence?.bankAccounts?.length || 0) > 0 ||
    (intelligence?.phoneNumbers?.length || 0) > 0;

  if (hasIntel) {
    const captured = [];
    if (intelligence.upiIds?.length > 0)
      captured.push(`${intelligence.upiIds.length} UPI ID(s)`);
    if (intelligence.bankAccounts?.length > 0)
      captured.push(`${intelligence.bankAccounts.length} bank account(s)`);
    if (intelligence.phoneNumbers?.length > 0)
      captured.push(`${intelligence.phoneNumbers.length} phone(s)`);
    if (intelligence.phishingLinks?.length > 0)
      captured.push(`${intelligence.phishingLinks.length} link(s)`);
    noteParts.push(`captured: ${captured.join(", ")}.`);
  } else {
    noteParts.push("No actionable financial data extracted.");
  }

  const fallbackNotes = noteParts.join(" ");

  // AI-Powered Summary (Async, with timeout)
  // Define extractedIntelligence outside try block to be available in both return statements
  const extractedIntelligence = {
    phishingLinks: intelligence?.phishingLinks || [],
    upiIds: intelligence?.upiIds || [],
    phoneNumbers: intelligence?.phoneNumbers || [],
    bankAccounts: intelligence?.bankAccounts || [],
    emailAddresses: intelligence?.emailAddresses || [],
  };

  const totalMessagesExchanged = Math.max(stats?.messages || 0, history.length);
  const engagementDurationSeconds = getEngagementDurationSeconds(
    sessionId,
    endTime,
  );

  try {
    // Format conversation for LLM (limit to last 12 exchanges = ~24 messages)
    const recentHistory = history.slice(-24);
    const chatLog = recentHistory
      .map((h) => `${getRoleName(h)}: ${getMessageText(h)}`)
      .join("\n");

    // Check if we have enough conversation to summarize
    if (chatLog.length < 50) {
      console.log("Conversation too short for AI summary, using fallback");
      return {
        status: "success",
        sessionId: sessionId,
        scamDetected: stats?.scamDetected || false,
        extractedIntelligence: extractedIntelligence,
        engagementMetrics: {
          totalMessagesExchanged,
          engagementDurationSeconds,
        },
        agentNotes: fallbackNotes,
      };
    }

    const prompt = `You are a cybersecurity analyst. Analyze this scam conversation and write a 2-3 sentence summary.

SCAM TYPE: ${meta?.scamType || "Unknown"}
TURNS: ${stats?.messages || 0}
INTELLIGENCE: ${hasIntel ? "Captured" : "None"}

CONVERSATION:
 ${chatLog}

Cover: (1) Scammer's tactics (urgency/fear/greed) (2) How agent stalled (3) Outcome
Max 50 words.

Return JSON: {"summary": "your text here"}`;

    // Use JSON function for reliable structured output
    const result = await Promise.race([
      generateGroqJsonWithRetry(prompt),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("summary_timeout")), 2500),
      ),
    ]);

    if (result.summary && result.summary.length > 15) {
      console.log("✓ AI summary generated successfully");
      return {
        status: "success",
        sessionId: sessionId,
        scamDetected: stats?.scamDetected || false,
        extractedIntelligence: extractedIntelligence,
        engagementMetrics: {
          totalMessagesExchanged,
          engagementDurationSeconds,
        },
        agentNotes: result.summary,
      };
    }

    // If AI returned empty/short response, use fallback
    console.log("AI summary too short, using fallback");
  } catch (err) {
    console.warn("AI summary generation failed, using fallback:", err.message);
  }

  // Return with fallback notes
  return {
    status: "success",
    sessionId: sessionId,
    scamDetected: stats?.scamDetected || false,
    extractedIntelligence: extractedIntelligence,
    engagementMetrics: {
      totalMessagesExchanged,
      engagementDurationSeconds,
    },
    agentNotes: fallbackNotes,
  };
};

export default buildFinalReport;
