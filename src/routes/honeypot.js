import express from "express";
import verifyApikey from "../middleware/auth.js";
import { orchestrateResponse } from "../services/scamOrchestrator.js";

const router = express.Router();

function buildStructuredResponse(result = {}) {
  return {
    status: "success",
    reply: result.reply || "",
    scamDetected: Boolean(result.scamDetected),
    extractedIntelligence: {
      phoneNumbers: result.extractedIntelligence?.phoneNumbers || [],
      bankAccounts: result.extractedIntelligence?.bankAccounts || [],
      upiIds: result.extractedIntelligence?.upiIds || [],
      phishingLinks: result.extractedIntelligence?.phishingLinks || [],
      emailAddresses: result.extractedIntelligence?.emailAddresses || [],
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

    if (
      !sessionId ||
      !message ||
      !sender ||
      !messageText ||
      timestamp === undefined ||
      timestamp === null ||
      typeof timestamp !== "number"
    ) {
      return res.status(400).json({
        error:
          "Invalid request: sessionId and message.{sender,text,timestamp} are required",
      });
    }

    if (!["scammer", "user"].includes(sender)) {
      return res.status(400).json({
        error: "Invalid request: message.sender must be 'scammer' or 'user'",
      });
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
    );

    if (result?.skipped) {
      return res.json({
        status: "success",
        reply: "",
        scamDetected: false,
        extractedIntelligence: {
          phoneNumbers: [],
          bankAccounts: [],
          upiIds: [],
          phishingLinks: [],
          emailAddresses: [],
        },
        agentNotes: result.reason || "Message sender skipped by orchestrator.",
      });
    }

    if (result.shouldStop) {
      return res.json(buildStructuredResponse({
        ...result,
        reply: "Connection closed.",
      }));
    }

    return res.json(buildStructuredResponse(result));
  } catch (error) {
    console.error("Error in honeypot route:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
