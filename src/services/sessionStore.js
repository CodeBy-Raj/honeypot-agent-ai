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
    sessionMeta.set(sessionId, {
      persona: randomPersona,
      scamType: "unknown",
      stage: "analysis",
      goal: "engage",
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
  }
}
