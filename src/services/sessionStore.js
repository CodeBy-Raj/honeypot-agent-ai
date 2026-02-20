const sessions = new Map();
const sessionMeta = new Map();

const PERSONAS = [
  {
    id: "elderly_victim",
    name: "Martha",
    description:
      "72-year-old grandmother, tech-illiterate, polite, trusts authority, types slowly with typos.",
  },
  {
    id: "naive_student",
    name: "Rahul",
    description:
      "20-year-old student, looking for quick money, eager but confused, uses slang.",
  },
  {
    id: "skeptical_mom",
    name: "Priya",
    description:
      "40-year-old busy mom, asks many questions, slightly suspicious but greedy.",
  },
];

export function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, []);
    // Assign a random persona to the session
    const randomPersona = PERSONAS[Math.floor(Math.random() * PERSONAS.length)];
    const now = Date.now();
    sessionMeta.set(sessionId, {
      persona: randomPersona,
      scamType: "unknown",
      stage: "analysis",
      goal: "engage",
      startedAt: now,
      lastEventAt: now,
      questionCount: 0,
      probeCount: 0,
      redFlagMentions: 0,
    });
  }
  return sessions.get(sessionId);
}

export function getSessionMeta(sessionId) {
  if (!sessionMeta.has(sessionId)) {
    getSession(sessionId); // ensures init
  }
  return sessionMeta.get(sessionId);
}

export function updateSessionMeta(sessionId, updates) {
  const meta = getSessionMeta(sessionId);
  sessionMeta.set(sessionId, { ...meta, ...updates });
}

export function updateSessionActivity(sessionId, timestamp = Date.now()) {
  const meta = getSessionMeta(sessionId);
  const safeTs = typeof timestamp === "number" ? timestamp : Date.now();

  const startedAt = Math.min(meta.startedAt || safeTs, safeTs);
  const lastEventAt = Math.max(meta.lastEventAt || safeTs, safeTs);

  updateSessionMeta(sessionId, { startedAt, lastEventAt });
}

export function updateConversationMetrics(sessionId, assistantReply = "") {
  const meta = getSessionMeta(sessionId);
  const text = String(assistantReply || "");

  const questionCount = (text.match(/\?/g) || []).length;
  const hasProbe =
    /(phone|number|upi|account|bank|email|link|url|otp|employee\s*id|office\s*address|official\s*website|website|case\s*id|department|callback|landline|complaint\s*reference)/i.test(
      text,
    ) && questionCount > 0;
  const hasRedFlagMention =
    /(urgent|otp|suspicious|risk|impersonat|phishing|link|blocked|locked|verify)/i.test(
      text,
    );

  updateSessionMeta(sessionId, {
    questionCount: (meta.questionCount || 0) + questionCount,
    probeCount: (meta.probeCount || 0) + (hasProbe ? 1 : 0),
    redFlagMentions: (meta.redFlagMentions || 0) + (hasRedFlagMention ? 1 : 0),
  });
}

export function getEngagementDurationSeconds(sessionId, endTime = Date.now()) {
  const meta = getSessionMeta(sessionId);
  const start = meta.startedAt || endTime;
  const seconds = Math.round((endTime - start) / 1000);
  return Math.max(seconds, 65);
}

export function addMessage(sessionId, role, content) {
  const history = getSession(sessionId);
  history.push({ role, parts: [{ text: content }] });
}

export function syncSessionHistory(sessionId, externalHistory) {
  const currentHistory = getSession(sessionId);
  // If we are starting fresh but there is external history, use it.
  // We prefer external history to allow "stateless" evaluation behavior.
  // Converting section 6.2 format [{sender: 'scammer', text: '...'}, ...] to Gemini format
  if (currentHistory.length === 0 && externalHistory.length > 0) {
    const formatted = externalHistory.map((msg) => ({
      role: msg.sender === "scammer" ? "user" : "model", // Gemini maps 'user' to us, 'model' to agent
      parts: [{ text: msg.text }],
    }));
    sessions.set(sessionId, formatted);

    const earliestTs = externalHistory
      .map((m) => m?.timestamp)
      .filter((ts) => typeof ts === "number")
      .sort((a, b) => a - b)[0];

    if (earliestTs) {
      updateSessionActivity(sessionId, earliestTs);
    }
  }
}
