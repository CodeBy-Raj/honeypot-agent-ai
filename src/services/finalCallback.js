const callback_url = "https://hackathon.guvi.in/api/updateHoneyPotFinalResult";

function normalizeFinalPayload(resultData = {}) {
  return {
    sessionId: resultData.sessionId || null,
    scamDetected: Boolean(resultData.scamDetected),
    totalMessagesExchanged: Number(
      resultData.totalMessagesExchanged ||
        resultData.engagementMetrics?.totalMessagesExchanged ||
        0,
    ),
    engagementDurationSeconds: Number(
      resultData.engagementDurationSeconds ||
        resultData.engagementMetrics?.engagementDurationSeconds ||
        0,
    ),
    extractedIntelligence: {
      bankAccounts: resultData.extractedIntelligence?.bankAccounts || [],
      upiIds: resultData.extractedIntelligence?.upiIds || [],
      phishingLinks: resultData.extractedIntelligence?.phishingLinks || [],
      phoneNumbers: resultData.extractedIntelligence?.phoneNumbers || [],
      emailAddresses: resultData.extractedIntelligence?.emailAddresses || [],
    },
    agentNotes: String(resultData.agentNotes || ""),
  };
}

const finalcallback = async (resultData) => {
  try {
    const payload = normalizeFinalPayload(resultData);

    const response = await fetch(callback_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      const truncatedBody = errorBody.slice(0, 2000);
      console.error("GUVI callback failed", {
        status: response.status,
        statusText: response.statusText,
        responseBody: truncatedBody,
      });
      throw new Error("Something Went Wrong with status: " + response.status);
    }

    const data = await response.json();
    console.log("Callback sent successfully, with data", data);
    return data;
  } catch (error) {
    console.error("Something went wrong", error.message);
    return null;
  }
};

export default finalcallback;
