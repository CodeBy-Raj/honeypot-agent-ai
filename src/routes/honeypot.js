import express from "express";
import verifyApikey from "../middleware/auth.js";
import { orchestrateResponse } from "../services/scamOrchestrator.js";

const router = express.Router();

function buildStructuredResponse(result = {}) {
  const totalMessagesExchanged = Number(
    result.engagementMetrics?.totalMessagesExchanged ||
      result.totalMessagesExchanged ||
      0,
  );
  const engagementDurationSeconds = Number(
    result.engagementMetrics?.engagementDurationSeconds ||
      result.engagementDurationSeconds ||
      0,
  );

  return {
    status: "success",
    sessionId: result.sessionId || null,
    reply: result.reply || "",
    scamDetected: Boolean(result.scamDetected),
    extractedIntelligence: {
      phoneNumbers: result.extractedIntelligence?.phoneNumbers || [],
      bankAccounts: result.extractedIntelligence?.bankAccounts || [],
      upiIds: result.extractedIntelligence?.upiIds || [],
      phishingLinks: result.extractedIntelligence?.phishingLinks || [],
      emailAddresses: result.extractedIntelligence?.emailAddresses || [],
    },
    engagementMetrics: {
      totalMessagesExchanged,
      engagementDurationSeconds,
    },
    agentNotes: result.agentNotes || "",
  };
}

router.post("/honeypot", verifyApikey, async (req, res) => {
  try {
    const { sessionId, message, conversationHistory } = req.body;
    const messageText = message?.text;
    const sender = message?.sender;
    const timestamp = message?.timestamp;

    if (req.authError) {
      return res.json(
        buildStructuredResponse({
          sessionId: sessionId || null,
          reply: "Unable to process request.",
          scamDetected: false,
          agentNotes: req.authError,
          extractedIntelligence: {
            phoneNumbers: [],
            bankAccounts: [],
            upiIds: [],
            phishingLinks: [],
            emailAddresses: [],
          },
        }),
      );
    }

    if (
      !sessionId ||
      !message ||
      !sender ||
      !messageText ||
      timestamp === undefined ||
      timestamp === null ||
      typeof timestamp !== "number"
    ) {
      return res.json(
        buildStructuredResponse({
          sessionId: sessionId || null,
          reply: "Please provide required message fields.",
          scamDetected: false,
          agentNotes:
            "Invalid request: sessionId and message.{sender,text,timestamp} are required",
          extractedIntelligence: {
            phoneNumbers: [],
            bankAccounts: [],
            upiIds: [],
            phishingLinks: [],
            emailAddresses: [],
          },
        }),
      );
    }

    if (!["scammer", "user"].includes(sender)) {
      return res.json(
        buildStructuredResponse({
          sessionId,
          reply: "Invalid sender type.",
          scamDetected: false,
          agentNotes:
            "Invalid request: message.sender must be 'scammer' or 'user'",
          extractedIntelligence: {
            phoneNumbers: [],
            bankAccounts: [],
            upiIds: [],
            phishingLinks: [],
            emailAddresses: [],
          },
        }),
      );
    }

    // If the message is NOT from a scammer (e.g., system event or user),
    // we might want to log it but NOT trigger the scam agent logic.
    // However, for the hackathon, we assume ALL incoming traffic is to be analyzed.

    // We pass the sender info to orchestrator just in case we need logic branching later
    const result = await orchestrateResponse(
      sessionId,
      messageText,
      conversationHistory || [],
      sender,
      timestamp,
    );

    if (result?.skipped) {
      return res.json(
        buildStructuredResponse({
          sessionId,
          reply: "",
          scamDetected: false,
          extractedIntelligence: {
            phoneNumbers: [],
            bankAccounts: [],
            upiIds: [],
            phishingLinks: [],
            emailAddresses: [],
          },
          engagementMetrics: {
            totalMessagesExchanged: 0,
            engagementDurationSeconds: 0,
          },
          agentNotes:
            result.reason || "Message sender skipped by orchestrator.",
        }),
      );
    }

    if (result.shouldStop) {
      return res.json(
        buildStructuredResponse({
          ...result,
          ...(result.finalOutput || {}),
          reply: "Connection closed.",
        }),
      );
    }

    return res.json(buildStructuredResponse(result));
  } catch (error) {
    console.error("Error in honeypot route:", error);
    return res.json(
      buildStructuredResponse({
        sessionId: req.body?.sessionId || null,
        reply: "Temporary issue. Please try again.",
        scamDetected: false,
        agentNotes: "Internal Server Error",
        extractedIntelligence: {
          phoneNumbers: [],
          bankAccounts: [],
          upiIds: [],
          phishingLinks: [],
          emailAddresses: [],
        },
      }),
    );
  }
});

export default router;
