
import { TANAOS_API_KEY } from "../config/env.js";

const tanaos_url = "https://slm.tanaos.com/models/spam-detection";

const detectScam = async (text) => {
  if (!text) return { isScam: false, score: 0, reasons: [] };

  try {
    const response = await fetch(tanaos_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": TANAOS_API_KEY,
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      console.error("Tanaos API error:", response.status, response.statusText);
    }

    const jsonResponse = await response.json();
    const result = jsonResponse.data && jsonResponse.data[0];

    if (!result) {
      return { isScam: false, score: 0, reasons: [] };
    }

    const isScam = result.label === "spam";

    return {
      isScam: isScam,
      score: result.score,
      reasons: isScam ? ["model_detected_spam"] : [],
    };
  } catch (error) {
    console.error("Scam detection Error:", error);
    return { isScam: false, score: 0, reasons: [] };
  }
};
export default detectScam;
