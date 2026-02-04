// src/services/intelligenceStore.js

const intelligenceDB = new Map();

export function initSession(sessionId) {
  if (!intelligenceDB.has(sessionId)) {
    intelligenceDB.set(sessionId, {
      links: new Set(),
      upiIds: new Set(),
      phoneNumbers: new Set(),
      suspiciousKeywords: new Set(),
    });
  }
}

export function addIntelligence(sessionId, extracted) {
  initSession(sessionId);

  const store = intelligenceDB.get(sessionId);

  extracted.links?.forEach((l) => store.links.add(l));
  extracted.upiIds?.forEach((u) => store.upiIds.add(u));
  extracted.phoneNumbers?.forEach((p) => store.phoneNumbers.add(p));
  extracted.suspiciousKeywords?.forEach((k) => store.suspiciousKeywords.add(k));
}

export function getIntelligence(sessionId) {
  const store = intelligenceDB.get(sessionId);
  if (!store) return null;

  return {
    links: [...store.links],
    upiIds: [...store.upiIds],
    phoneNumbers: [...store.phoneNumbers],
    suspiciousKeywords: [...store.suspiciousKeywords],
  };
}
