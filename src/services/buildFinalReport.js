import { getStats } from "./sessionStats.js";
import { getIntelligence } from "./intelligenceStore.js";

const buildFinalReport = (sessionId) => {
  const intelligence = getIntelligence(sessionId);
  const stats = getStats(sessionId);

  return {
    sessionId: sessionId,
    scamDetected: stats?.scamDetected || false,
    totalMessagesExchanged: stats?.messages || 0,
    extractedIntelligence: {
      phishingLinks: intelligence?.links || [],
      upiIds: intelligence?.upiIds || [],
      phoneNumbers: intelligence?.phoneNumbers || [],
      bankAccounts: intelligence?.bankAccounts || [],
      suspiciousKeywords: intelligence?.suspiciousKeywords || [],
    },
    agentNotes:
      "Scam interaction analyzed using autonomous AI agent and rule-based detection",
  };
};

export default buildFinalReport;
