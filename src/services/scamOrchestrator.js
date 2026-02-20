import detectScam from "./scamDetector.js";
import generateReply from "./agentServices.js";
import {
  extractIntelligence,
  extractIntelligenceWithLLM,
} from "./intelligenceExtractor.js";
import { addIntelligence, getIntelligence } from "./intelligenceStore.js";
import {
  getSession,
  addMessage,
  getSessionMeta,
  updateSessionMeta,
  syncSessionHistory,
  updateSessionActivity,
  updateConversationMetrics,
  getEngagementDurationSeconds,
} from "./sessionStore.js";
import {
  incrementMessages,
  markScam,
  getStats,
  syncStats,
} from "./sessionStats.js";
import buildFinalReport from "./buildFinalReport.js";
import finalcallback from "./finalCallback.js";
import {
  sanitizeBankCandidates,
  sanitizeEmailCandidates,
  sanitizePhoneCandidates,
} from "../utils/validator.js";

const MAX_MESSAGES = 17; // Increased slightly for more engagement
const MIN_MESSAGES = 8;

function getHistoryCorpusText(
  externalHistory = [],
  internalHistory = [],
  current,
) {
  const externalTexts = (externalHistory || [])
    .map((item) => item?.text)
    .filter(Boolean);

  const internalTexts = (internalHistory || [])
    .map((item) => item?.parts?.[0]?.text || item?.content)
    .filter(Boolean);

  return [...externalTexts, ...internalTexts, current]
    .filter(Boolean)
    .join("\n");
}

function enforceDeterministicReply(reply, probeTargets = [], meta = {}) {
  let finalReply = String(reply || "").trim();

  if (!finalReply) {
    finalReply = "ji, can you explain again?";
  }

  if ((meta.redFlagMentions || 0) < 3) {
    const hasRiskMention =
      /(urgent|otp|risk|suspicious|verify|blocked|locked|impersonat|phishing)/i.test(
        finalReply,
      );
    if (!hasRiskMention) {
      finalReply +=
        " this is sounding urgent and risky, why are you asking OTP and account details?";
    }
  }

  if (!finalReply.includes("?")) {
    const probe =
      probeTargets.length > 0
        ? ` can you repeat your ${probeTargets[0]}?`
        : " can you explain this clearly?";
    finalReply += probe;
  }

  if ((meta.probeCount || 0) < 3 && probeTargets.length > 0) {
    const hasProbePrompt =
      /(phone|number|upi|account|bank|email|link|url|otp)/i.test(finalReply);
    if (!hasProbePrompt) {
      finalReply += ` and please share your ${probeTargets[0]} again?`;
    }
  }

  return finalReply;
}

export const orchestrateResponse = async (
  sessionId,
  userMessage,
  externalHistory = [],
  sender = "scammer", // Added sender parameter
  messageTimestamp = Date.now(),
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
  updateSessionActivity(sessionId, messageTimestamp);

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
  const historyCorpus = getHistoryCorpusText(
    externalHistory,
    getSession(sessionId),
    userMessage,
  );
  const regexIntel = extractIntelligence(historyCorpus);

  const hasHighSignalRegexIntel =
    regexIntel.upiIds.length > 0 ||
    regexIntel.phishingLinks.length > 0 ||
    regexIntel.emailAddresses.length > 0 ||
    regexIntel.phoneNumbers.length > 0 ||
    regexIntel.bankAccounts.length > 0;

  const shouldRunDeepExtraction =
    !sessionStats.scamDetected || !hasHighSignalRegexIntel;

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
    shouldRunDeepExtraction
      ? extractIntelligenceWithLLM(userMessage)
      : Promise.resolve({}),
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
    emailAddresses: sanitizeEmailCandidates([
      ...regexIntel.emailAddresses,
      ...(llmIntel.entities?.emailAddress
        ? [llmIntel.entities.emailAddress]
        : []),
    ]),
    phoneNumbers: sanitizePhoneCandidates([
      ...regexIntel.phoneNumbers,
      ...(llmIntel.entities?.phoneNumber
        ? [llmIntel.entities.phoneNumber]
        : []),
    ]),
    suspiciousKeywords: [
      ...regexIntel.suspiciousKeywords,
      ...(llmIntel.suspiciousKeywords || []),
    ],
    // Add new fields for report
    // Capture both Name and Number if available
    bankAccounts: sanitizeBankCandidates([
      ...regexIntel.bankAccounts,
      ...(llmIntel.entities?.bankName ? [llmIntel.entities.bankName] : []),
      ...(llmIntel.entities?.bankAccountNumber
        ? [llmIntel.entities.bankAccountNumber]
        : []),
    ]),
  };

  mergedIntel.bankAccounts = mergedIntel.bankAccounts.filter(
    (candidate) => sanitizePhoneCandidates([candidate]).length === 0,
  );

  addIntelligence(sessionId, mergedIntel);

  const probeTargets = [];
  if (mergedIntel.phoneNumbers.length === 0) probeTargets.push("phone number");
  if (mergedIntel.upiIds.length === 0) probeTargets.push("UPI ID");
  if (mergedIntel.bankAccounts.length === 0)
    probeTargets.push("bank account details");
  if (mergedIntel.phishingLinks.length === 0)
    probeTargets.push("suspicious link");
  if (mergedIntel.emailAddresses.length === 0)
    probeTargets.push("email address");

  // 3. Update Session Meta & Strategy
  const currentMeta = getSessionMeta(sessionId);

  // Strategy Logic
  const scamActive = detection.isScam || sessionStats.scamDetected;
  let newGoal = "engage";
  if (scamActive) {
    if (
      mergedIntel.upiIds.length > 0 ||
      mergedIntel.phishingLinks.length > 0 ||
      mergedIntel.emailAddresses.length > 0 ||
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

  const normalizedIntelligence = () => {
    const intelligence = getIntelligence(sessionId) || {};
    return {
      phoneNumbers: intelligence.phoneNumbers || [],
      bankAccounts: intelligence.bankAccounts || [],
      upiIds: intelligence.upiIds || [],
      phishingLinks: intelligence.phishingLinks || [],
      emailAddresses: intelligence.emailAddresses || [],
    };
  };

  const buildAgentNotes = (scamDetectedFlag) => {
    const scamType = llmIntel.scamType || currentMeta.scamType || "unknown";
    if (!scamDetectedFlag) {
      return "No strong scam signal detected in the latest message.";
    }
    return `Scam signals detected (${scamType}). Current engagement strategy: ${newGoal}.`;
  };

  if (!scamActive) {
    const safeReply = "Thanks for your message.";
    addMessage(sessionId, "user", userMessage);
    addMessage(sessionId, "assistant", safeReply);
    updateConversationMetrics(sessionId, safeReply);
    return {
      sessionId,
      reply: safeReply,
      scamDetected: false,
      engagementMetrics: {
        totalMessagesExchanged: Math.max(
          sessionStats.messages,
          getSession(sessionId).length,
        ),
        engagementDurationSeconds: getEngagementDurationSeconds(
          sessionId,
          messageTimestamp,
        ),
      },
      extractedIntelligence: normalizedIntelligence(),
      agentNotes: buildAgentNotes(false),
      shouldStop: false,
      meta: getSessionMeta(sessionId),
    };
  }

  const meetsConversationQuality =
    (currentMeta.questionCount || 0) >= 5 &&
    (currentMeta.probeCount || 0) >= 3 &&
    (currentMeta.redFlagMentions || 0) >= 3;

  const shouldStopNow =
    sessionStats.messages >= MAX_MESSAGES ||
    (sessionStats.messages >= MIN_MESSAGES && meetsConversationQuality);

  // 4. Check Stopping Condition
  if (shouldStopNow) {
    const finalOutput = await buildFinalReport(sessionId, {
      endTime: messageTimestamp,
    });

    try {
      await Promise.race([
        finalcallback(finalOutput),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("final_callback_timeout_10s")),
            10000,
          ),
        ),
      ]);
    } catch (err) {
      console.error("Final report callback issue:", err?.message || err);
    }

    return {
      status: "success",
      sessionId,
      reply: "Connection closed.",
      scamDetected: Boolean(finalOutput.scamDetected),
      engagementMetrics: {
        totalMessagesExchanged:
          finalOutput.engagementMetrics?.totalMessagesExchanged || 0,
        engagementDurationSeconds:
          finalOutput.engagementMetrics?.engagementDurationSeconds ||
          getEngagementDurationSeconds(sessionId, messageTimestamp),
      },
      extractedIntelligence: finalOutput.extractedIntelligence,
      agentNotes: finalOutput.agentNotes,
      shouldStop: true,
      finalOutput,
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

  const rawAgentReply = await generateReply(
    userMessage,
    history,
    currentMeta.persona,
    newGoal,
    probeTargets,
  );

  const agentReply = enforceDeterministicReply(
    rawAgentReply,
    probeTargets,
    currentMeta,
  );

  // 6. Update History
  addMessage(sessionId, "user", userMessage);
  addMessage(sessionId, "assistant", agentReply);
  updateConversationMetrics(sessionId, agentReply);

  return {
    sessionId,
    reply: agentReply,
    scamDetected: true,
    engagementMetrics: {
      totalMessagesExchanged: Math.max(
        sessionStats.messages,
        history.length + 2,
      ),
      engagementDurationSeconds: getEngagementDurationSeconds(
        sessionId,
        messageTimestamp,
      ),
    },
    extractedIntelligence: normalizedIntelligence(),
    agentNotes: buildAgentNotes(true),
    shouldStop: false,
    meta: getSessionMeta(sessionId), // useful for debug
  };
};
