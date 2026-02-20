import dotenv from "dotenv";
import { scenarios } from "./scenarios.js";
import { evaluateFinalOutput } from "./evaluate_final_output.js";

dotenv.config();

const BASE_URL =
  process.env.ENDPOINT_URL || "http://localhost:3000/api/honeypot";
const API_KEY = process.env.API_KEY || "dev-secret-key";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendTurn({ sessionId, text, conversationHistory }) {
  const startedAt = Date.now();

  const response = await fetch(BASE_URL, {
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
        timestamp: Date.now(),
      },
      conversationHistory,
      metadata: {
        channel: "SMS",
        language: "English",
        locale: "IN",
      },
    }),
  });

  const latencyMs = Date.now() - startedAt;
  const payload = await response.json();

  return { status: response.status, payload, latencyMs };
}

function buildFallbackFinalOutput(sessionId, lastPayload, conversationHistory) {
  return {
    status: "success",
    sessionId,
    scamDetected: Boolean(lastPayload?.scamDetected),
    engagementMetrics: {
      totalMessagesExchanged:
        Number(lastPayload?.engagementMetrics?.totalMessagesExchanged || 0) ||
        conversationHistory.length,
      engagementDurationSeconds:
        Number(
          lastPayload?.engagementMetrics?.engagementDurationSeconds || 0,
        ) || 1,
    },
    extractedIntelligence: {
      phoneNumbers: lastPayload?.extractedIntelligence?.phoneNumbers || [],
      bankAccounts: lastPayload?.extractedIntelligence?.bankAccounts || [],
      upiIds: lastPayload?.extractedIntelligence?.upiIds || [],
      phishingLinks: lastPayload?.extractedIntelligence?.phishingLinks || [],
      emailAddresses: lastPayload?.extractedIntelligence?.emailAddresses || [],
    },
    agentNotes:
      lastPayload?.agentNotes || "No final output returned by endpoint.",
  };
}

async function runScenario(scenario) {
  const sessionId = `eval-${scenario.scenarioId}-${Date.now()}`;
  const conversationHistory = [];
  const latencies = [];

  let lastPayload = null;

  for (let turn = 0; turn < 10; turn += 1) {
    const scammerText =
      scenario.scammerMessages[turn] || "Please respond quickly.";

    const { status, payload, latencyMs } = await sendTurn({
      sessionId,
      text: scammerText,
      conversationHistory,
    });

    latencies.push(latencyMs);
    lastPayload = payload;

    conversationHistory.push({
      sender: "scammer",
      text: scammerText,
      timestamp: Date.now(),
    });

    conversationHistory.push({
      sender: "agent",
      text: payload.reply || "",
      timestamp: Date.now(),
    });

    if (status !== 200) {
      throw new Error(`Non-200 response on turn ${turn + 1}: ${status}`);
    }

    if ((payload.reply || "").toLowerCase().includes("connection closed")) {
      break;
    }

    await delay(250);
  }

  const finalOutput = buildFallbackFinalOutput(
    sessionId,
    lastPayload,
    conversationHistory,
  );
  const evaluation = evaluateFinalOutput(
    finalOutput,
    scenario,
    conversationHistory,
  );

  const maxLatency = Math.max(...latencies);
  const avgLatency = Math.round(
    latencies.reduce((sum, x) => sum + x, 0) / latencies.length,
  );

  return {
    scenarioId: scenario.scenarioId,
    finalOutput,
    evaluation,
    maxLatency,
    avgLatency,
    turns: conversationHistory.length,
  };
}

async function runAll() {
  console.log(`Running evaluator against: ${BASE_URL}`);
  const reports = [];

  for (const scenario of scenarios) {
    const report = await runScenario(scenario);
    reports.push(report);

    console.log(`\nScenario: ${scenario.scenarioId}`);
    console.log(`Scam Detection: ${report.evaluation.scores.scamDetection}/20`);
    console.log(
      `Intelligence Extraction: ${report.evaluation.scores.intelligenceExtraction}/30`,
    );
    console.log(
      `Conversation Quality: ${report.evaluation.scores.conversationQuality}/30`,
    );
    console.log(
      `Engagement Quality: ${report.evaluation.scores.engagementQuality}/10`,
    );
    console.log(
      `Response Structure: ${report.evaluation.scores.responseStructure}/10`,
    );
    console.log(`TOTAL: ${report.evaluation.total}/100`);
    console.log(
      `Latencies: avg=${report.avgLatency}ms, max=${report.maxLatency}ms`,
    );
  }

  const grandTotal = Math.round(
    reports.reduce((sum, r) => sum + r.evaluation.total, 0) / reports.length,
  );

  console.log("\n=========================");
  console.log(`Average score across scenarios: ${grandTotal}/100`);
  console.log("=========================\n");
}

runAll().catch((error) => {
  console.error("Scenario runner failed:", error.message || error);
  process.exit(1);
});
