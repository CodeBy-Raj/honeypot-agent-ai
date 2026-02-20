import dotenv from "dotenv";

dotenv.config();

const BASE_URL =
  process.env.ENDPOINT_URL || "http://localhost:3000/api/honeypot";
const API_KEY = process.env.API_KEY || "dev-secret-key";

const SCAM_TURNS = [
  "URGENT: Your account is under verification hold. Respond now.",
  "To prevent suspension, share the OTP and account details immediately.",
  "I sent a code to your phone. Confirm it now.",
  "Give your account number and UPI for verification.",
  "This is time sensitive. Reply without delay.",
  "Share callback number and email for urgent KYC update.",
  "Your account may be blocked. Verify now.",
  "Need your details now to avoid service interruption.",
  "Final reminder before temporary lock.",
  "Last chance to verify and avoid block.",
];

async function sendTurn(sessionId, text, conversationHistory, timestamp) {
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
    },
    body: JSON.stringify({
      sessionId,
      message: {
        sender: "scammer",
        text,
        timestamp,
      },
      conversationHistory,
      metadata: {
        channel: "SMS",
        language: "English",
        locale: "IN",
      },
    }),
  });

  const json = await res.json();
  return { status: res.status, json };
}

async function runOneSession(index) {
  const sessionId = `strict-${Date.now()}-${index}`;
  const conversationHistory = [];

  const startTs = Date.now();
  let finalOutput = null;

  for (let turn = 0; turn < SCAM_TURNS.length; turn += 1) {
    const ts = startTs + turn * 20_000;
    const { status, json } = await sendTurn(
      sessionId,
      SCAM_TURNS[turn],
      conversationHistory,
      ts,
    );

    if (status !== 200) {
      throw new Error(
        `HTTP ${status} for session ${sessionId} turn ${turn + 1}`,
      );
    }

    conversationHistory.push({
      sender: "scammer",
      text: SCAM_TURNS[turn],
      timestamp: ts,
    });
    conversationHistory.push({
      sender: "user",
      text: json.reply || "",
      timestamp: ts + 1,
    });

    finalOutput = json;
  }

  if (!finalOutput) {
    throw new Error(`No final output for session ${sessionId}`);
  }

  if (!finalOutput.engagementMetrics)
    throw new Error("Missing engagementMetrics");
  if (finalOutput.engagementMetrics.engagementDurationSeconds < 60)
    throw new Error("Duration too low");
}

async function main() {
  for (let i = 1; i <= 20; i += 1) {
    await runOneSession(i);
    console.log(`Session ${i}/20 passed`);
  }
  console.log("STRICT VALIDATION PASS: 20/20 sessions passed");
}

main().catch((err) => {
  console.error("STRICT VALIDATION FAIL:", err.message || err);
  process.exit(1);
});
