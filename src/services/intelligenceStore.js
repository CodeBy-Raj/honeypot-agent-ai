// src/services/intelligenceStore.js

const intelligenceDB = new Map();

export function initSession(sessionId) {
  if (!intelligenceDB.has(sessionId)) {
    intelligenceDB.set(sessionId, {
      phishingLinks: new Set(),
      upiIds: new Set(),
      emailAddresses: new Set(),
      phoneNumbers: new Set(),
      suspiciousKeywords: new Set(),
      bankAccounts: new Set(),
    });
  }
}

export function addIntelligence(sessionId, extracted) {
  initSession(sessionId);

  const store = intelligenceDB.get(sessionId);

  extracted.phishingLinks?.forEach((l) => store.phishingLinks.add(l));
  extracted.upiIds?.forEach((u) => store.upiIds.add(u));
  extracted.emailAddresses?.forEach((e) => store.emailAddresses.add(e));
  extracted.phoneNumbers?.forEach((p) => store.phoneNumbers.add(p));
  extracted.suspiciousKeywords?.forEach((k) => store.suspiciousKeywords.add(k));
  extracted.bankAccounts?.forEach((b) => store.bankAccounts.add(b));
}

export function getIntelligence(sessionId) {
  const store = intelligenceDB.get(sessionId);
  if (!store) return null;

  return {
    phishingLinks: [...store.phishingLinks],
    upiIds: [...store.upiIds],
    emailAddresses: [...store.emailAddresses],
    phoneNumbers: [...store.phoneNumbers],
    suspiciousKeywords: [...store.suspiciousKeywords],
    bankAccounts: [...store.bankAccounts],
  };
}
