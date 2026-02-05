import { getStats } from "./sessionStats.js";
import { getIntelligence } from "./intelligenceStore.js";
import { getSessionMeta } from "./sessionStore.js";

const buildFinalReport = (sessionId) => {
  const intelligence = getIntelligence(sessionId);
  const stats = getStats(sessionId);
  const meta = getSessionMeta(sessionId);

  // Generate Rules-Based Smart Summary
  const noteParts = [];
  noteParts.push(`Detected ${meta?.scamType || "potential"} scam attempt.`);
  noteParts.push(`Agent engaged for ${stats?.messages || 0} turns.`);

  const hasIntel =
    (intelligence?.upiIds?.length || 0) > 0 ||
    (intelligence?.bankAccounts?.length || 0) > 0 ||
    (intelligence?.phoneNumbers?.length || 0) > 0;

  if (hasIntel) {
    noteParts.push("CRITICAL: Financial intelligence captured.");
  } else {
    noteParts.push("No actionable financial data extracted.");
  }

  const generatedNotes = noteParts.join(" ");

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
    agentNotes: generatedNotes,
  };
};

export default buildFinalReport;
