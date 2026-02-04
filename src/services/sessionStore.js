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
  // Ensure session exists
  getSession(sessionId);
  return sessionMeta.get(sessionId);
}

export function updateSessionMeta(sessionId, updates) {
  const meta = getSessionMeta(sessionId);
  if (meta) {
    sessionMeta.set(sessionId, { ...meta, ...updates });
  }
}

export const addMessage = (sessionId, role, content) => {
  const history = getSession(sessionId);
  history.push({ role, content });
};