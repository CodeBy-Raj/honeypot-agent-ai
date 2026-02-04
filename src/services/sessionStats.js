const stats = new Map();

export const initStats = (sessionId) => {
  if (!stats.get(sessionId)) {
    stats.set(sessionId, {
      messages: 0,
      scamDetected: false,
    });
  }
};

export const incrementMessages = (sessionId) => {
  initStats(sessionId);
  stats.get(sessionId).messages += 1;
};

export const markScam = (sessionId) => {
  initStats(sessionId);
  stats.get(sessionId).scamDetected = true;
};

export const getStats = (sessionId) => {
  initStats(sessionId);
  return stats.get(sessionId);
};
