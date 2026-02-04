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
} from "./sessionStore.js";
import { incrementMessages, markScam, getStats } from "./sessionStats.js";
import buildFinalReport from "./buildFinalReport.js";
import finalcallback from "./finalCallback.js";

const MAX_MESSAGES = 15; // Increased slightly for more engagement

export const orchestrateResponse = async (sessionId, userMessage) => {
  // 1. Ingestion & Stats
  incrementMessages(sessionId);
  const sessionStats = getStats(sessionId);

  // 2. Parallel Analysis (Fast Regex + Slow LLM)
  const regexIntel = extractIntelligence(userMessage);

  // Trigger Fast Detection first
  let detection = { isScam: false };
  if (!sessionStats.scamDetected) {
    detection = await detectScam(userMessage);
    if (detection.isScam) {
      markScam(sessionId);
    }
  }

  // Deep Analysis (LLM) - Run in background or wait depending on architecture
  // For hackathon "Edge", we use it to refine strategy
  let llmIntel = {};
  try {
    llmIntel = await extractIntelligenceWithLLM(userMessage);
  } catch (e) {
    console.log("LLM Intel failed, falling back");
  }

  // Merge Intelligence
  const mergedIntel = {
    links: regexIntel.links,
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
    suspiciousKeywords: regexIntel.suspiciousKeywords,
    // Add new fields for report
    bankAccounts: llmIntel.entities?.bankName
      ? [llmIntel.entities.bankName]
      : [],
  };

  addIntelligence(sessionId, mergedIntel);

  // 3. Update Session Meta & Strategy
  const currentMeta = getSessionMeta(sessionId);
  
  // Strategy Logic
  let newGoal = "engage";
  if (detection.isScam || sessionStats.scamDetected) {
    if (mergedIntel.upiIds.length > 0 || mergedIntel.links.length > 0) {
      newGoal = "stall_and_validate"; // We have the goods, now waste time
    } else {
      newGoal = "lure_payment_details"; // We need the goods
    }
  }

  updateSessionMeta(sessionId, {
    scamType: llmIntel.scamType || currentMeta.scamType,
    goal: newGoal,
  });

  // 4. Check Stopping Condition
  if (sessionStats.messages >= MAX_MESSAGES) {
      const report = buildFinalReport(sessionId);
      await finalcallback(report);
      return {
          reply: "Okay, I will look into it. Thanks.",
          shouldStop: true
      }
  }
  
  // 5. Generate Reply with Persona & Goal
  const history = getSession(sessionId);
  
  // Don't reply if not a scam (in a real honeypot), but for hackathon contest we might want to be chatty
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
    newGoal
  );

  // 6. Update History
  addMessage(sessionId, "user", userMessage);
  addMessage(sessionId, "assistant", agentReply);

  return {
    reply: agentReply,
    shouldStop: false,
    meta: getSessionMeta(sessionId) // useful for debug
  };
};
