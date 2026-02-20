function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\s\-()+]/g, "");
}

function flattenExtracted(extractedIntelligence = {}) {
  return [
    ...(extractedIntelligence.phoneNumbers || []),
    ...(extractedIntelligence.bankAccounts || []),
    ...(extractedIntelligence.upiIds || []),
    ...(extractedIntelligence.phishingLinks || []),
    ...(extractedIntelligence.emailAddresses || []),
  ];
}

export function evaluateFinalOutput(
  finalOutput,
  scenario,
  conversationHistory,
) {
  const scores = {
    scamDetection: 0,
    intelligenceExtraction: 0,
    conversationQuality: 0,
    engagementQuality: 0,
    responseStructure: 0,
  };

  if (finalOutput.scamDetected === true) {
    scores.scamDetection = 20;
  }

  const fakeFields = Object.values(scenario.fakeData || {});
  const totalFake = Math.max(1, fakeFields.length);
  const extracted = flattenExtracted(finalOutput.extractedIntelligence || {});

  let extractedCount = 0;
  for (const fakeValue of fakeFields) {
    const nFake = normalize(fakeValue);
    const matched = extracted.some((item) => {
      const nItem = normalize(item);
      return nItem.includes(nFake) || nFake.includes(nItem);
    });

    if (matched) extractedCount += 1;
  }

  scores.intelligenceExtraction = Math.floor((extractedCount / totalFake) * 30);

  const turns = conversationHistory.length;
  if (turns >= 8) scores.conversationQuality += 8;

  const agentMessages = conversationHistory.filter((m) => m.sender === "agent");

  const questions = agentMessages.filter((m) => m.text.includes("?")).length;
  if (questions >= 5) scores.conversationQuality += 4;

  const redFlagKeywords = [
    "otp",
    "urgent",
    "payment",
    "suspicious",
    "link",
    "impersonat",
    "verify",
    "risk",
  ];

  const redFlags = agentMessages.filter((m) =>
    redFlagKeywords.some((key) => m.text.toLowerCase().includes(key)),
  ).length;
  if (redFlags >= 3) scores.conversationQuality += 8;

  const elicitationKeywords = [
    "phone",
    "upi",
    "account",
    "email",
    "link",
    "number",
  ];
  const elicitationCount = agentMessages.filter((m) =>
    elicitationKeywords.some((key) => m.text.toLowerCase().includes(key)),
  ).length;
  if (elicitationCount >= 5) scores.conversationQuality += 7;

  const investigativeKeywords = [
    "employee id",
    "branch",
    "official",
    "address",
    "office",
    "call back",
  ];
  const investigativeCount = agentMessages.filter((m) =>
    investigativeKeywords.some((key) => m.text.toLowerCase().includes(key)),
  ).length;
  if (investigativeCount >= 3) scores.conversationQuality += 3;

  const totalMessagesExchanged = Number(
    finalOutput.engagementMetrics?.totalMessagesExchanged || 0,
  );
  const engagementDurationSeconds = Number(
    finalOutput.engagementMetrics?.engagementDurationSeconds || 0,
  );

  if (totalMessagesExchanged >= 8) {
    scores.engagementQuality += 5;
  }

  if (engagementDurationSeconds > 0) {
    scores.engagementQuality += 5;
  }

  const requiredFields = [
    "status",
    "sessionId",
    "scamDetected",
    "extractedIntelligence",
    "engagementMetrics",
    "agentNotes",
  ];

  const hasAllRequired = requiredFields.every((field) => field in finalOutput);

  const hasExtractFields =
    finalOutput.extractedIntelligence &&
    [
      "phoneNumbers",
      "bankAccounts",
      "upiIds",
      "phishingLinks",
      "emailAddresses",
    ].every((field) => field in finalOutput.extractedIntelligence);

  if (hasAllRequired && hasExtractFields) {
    scores.responseStructure = 10;
  }

  const total =
    scores.scamDetection +
    scores.intelligenceExtraction +
    scores.conversationQuality +
    scores.engagementQuality +
    scores.responseStructure;

  return { scores, total, extractedCount, totalFake };
}
