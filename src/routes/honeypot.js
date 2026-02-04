import express from "express";
import verifyApikey from "../middleware/auth.js";
import { orchestrateResponse } from "../services/scamOrchestrator.js";

const router = express.Router();

router.post("/honeypot", verifyApikey, async (req, res) => {
  try {
    const { sessionId, message } = req.body;
    const messageText = message?.text || "";

    const result = await orchestrateResponse(sessionId, messageText);

    if (result.shouldStop) {
       return res.json({
         status: "success",
         reply: "Connection closed.", // Or keep silent.
        });
    }

    return res.json({
      status: "success",
      reply: result.reply,
    });
  } catch (error) {
    console.error("Error in honeypot route:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
