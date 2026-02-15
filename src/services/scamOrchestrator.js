import detectScam from "./scamDetector.js";
import generateReply from "./agentServices.js";
import {
  extractIntelligence,
  extractIntelligenceWithLLM,
} from "./intelligenceExtractor.js";
import { addIntelligence } from "./intelligenceStore.js";
import {
  getSession,
  addMessage,
  getSessionMeta,
  updateSessionMeta,
  syncSessionHistory,
} from "./sessionStore.js";
import {
  incrementMessages,
  markScam,
  getStats,
  syncStats,
} from "./sessionStats.js";
import buildFinalReport from "./buildFinalReport.js";
import finalcallback from "./finalCallback.js";

const MAX_MESSAGES = 17; // Increased slightly for more engagement

export const orchestrateResponse = async (
  sessionId,
  userMessage,
  externalHistory = [],
  sender = "scammer", // Added sender parameter
) => {
  // Guard Clause: If sender is not scammer (e.g., echo/user message), skip orchestration
  // to avoid infinite loops and role-history corruption.
  if (sender !== "scammer") {
    console.warn(
      `[Orchestrator] Received message from '${sender}'. Skipping orchestration because sender is not 'scammer'.`,
    );
    return {
      skipped: true,
      reason: "non-scammer-sender",
      sender,
    };
  }

  // 0. Sync State (Evaluation Readiness)
  if (externalHistory && externalHistory.length > 0) {
    syncSessionHistory(sessionId, externalHistory);
    // Rough estimate: history length is total messages exchanged previously
    // If history has 2 items (1 scammer, 1 user), that's 2 messages.
    syncStats(sessionId, externalHistory.length);
  }

  // 1. Ingestion & Stats
  incrementMessages(sessionId);
  const sessionStats = getStats(sessionId);

  // 2. Parallel Analysis (Fast Regex + Parallel Models)
  const regexIntel = extractIntelligence(userMessage);

  // Run Tanaos (Detection) and Groq (Extraction) in PARALLEL for speed
  const [detection, llmIntel] = await Promise.all([
    // Task 1: Scam Detection (Tanaos)
    (async () => {
      if (!sessionStats.scamDetected) {
        const res = await detectScam(userMessage);
        if (res.isScam) markScam(sessionId);
        return res;
      }
      return { isScam: true }; // Already detected
    })(),
    // Task 2: Deep Analysis (Groq/Gemini)
    extractIntelligenceWithLLM(userMessage),
  ]);

  // Combine Intelligence (unchanged logic)
  const mergedIntel = {
    phishingLinks: [
      ...regexIntel.phishingLinks,
      ...(llmIntel.entities?.url ? [llmIntel.entities.url] : []),
    ],
    upiIds: [
      ...regexIntel.upiIds,
      ...(llmIntel.entities?.upiId ? [llmIntel.entities.upiId] : []),
    ],
    phoneNumbers: [
      ...regexIntel.phoneNumbers,
      ...(llmIntel.entities?.phoneNumber
        ? [llmIntel.entities.phoneNumber]
        : []),
    ],
    suspiciousKeywords: [
      ...regexIntel.suspiciousKeywords,
      ...(llmIntel.suspiciousKeywords || []),
    ],
    // Add new fields for report
    // Capture both Name and Number if available
    bankAccounts: [
      ...(llmIntel.entities?.bankName ? [llmIntel.entities.bankName] : []),
      ...(llmIntel.entities?.bankAccountNumber
        ? [llmIntel.entities.bankAccountNumber]
        : []),
    ],
  };

  addIntelligence(sessionId, mergedIntel);

  // 3. Update Session Meta & Strategy
  const currentMeta = getSessionMeta(sessionId);

  // Strategy Logic
  const scamActive = detection.isScam || sessionStats.scamDetected;
  let newGoal = "engage";
  if (scamActive) {
    if (
      mergedIntel.upiIds.length > 0 ||
      mergedIntel.phishingLinks.length > 0 ||
      mergedIntel.phoneNumbers.length > 0 ||
      mergedIntel.bankAccounts.length > 0
    ) {
      newGoal = "stall_and_validate"; // We have the goods, now waste time
    } else {
      newGoal = "lure_payment_details"; // We need the goods
    }
  }

  updateSessionMeta(sessionId, {
    scamType: llmIntel.scamType || currentMeta.scamType,
    goal: newGoal,
  });

  if (!scamActive) {
    const safeReply = "Thanks for your message.";
    addMessage(sessionId, "user", userMessage);
    addMessage(sessionId, "assistant", safeReply);
    return {
      reply: safeReply,
      shouldStop: false,
      meta: getSessionMeta(sessionId),
    };
  }

  // 4. Check Stopping Condition
  if (sessionStats.messages >= MAX_MESSAGES) {
    const report = await buildFinalReport(sessionId);
    await finalcallback(report);
    return {
      reply: "Connection closed. (Honeypot Session Complete)",
      shouldStop: true,
    };
  }

  // 5. Generate Response
  // Get full history from store (now hydrated)
  const history = getSession(sessionId);

  // adhering to spec: "If scam intent is detected, the AI Agent is activated"
  // But we need to respond to the First Message regardless to confirm receipt usually?
  // No, spec says "2. Your system analyzes... 3. If scam detected -> Agent activated".
  // If not scam, strictly speaking we might return "Success" or ignore.
  // But let's assume aggressive honeypotting: treat everything as potential scam or neutral.

  // We rely on previous `honeypot.js` logic which replied "Okay tell me more" if not scam.
  // We will let the Agent handle it but instruct it to be cautious if not sure.

  const agentReply = await generateReply(
    userMessage,
    history,
    currentMeta.persona,
    newGoal,
  );

  // 6. Update History
  addMessage(sessionId, "user", userMessage);
  addMessage(sessionId, "assistant", agentReply);

  return {
    reply: agentReply,
    shouldStop: false,
    meta: getSessionMeta(sessionId), // useful for debug
  };
};
