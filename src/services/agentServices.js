import { GoogleGenerativeAI } from "@google/generative-ai";
import { GEMINI_API_KEY, AI_PROVIDER } from "../config/env.js";
import { generateGroqReplyWithRetry } from "./groqServicesWithRotation.js";

const SYSTEM_PROMPT = `
You are a naive, middle-class Indian person engaging with a message sender. You are not tech-savvy and get confused easily.

YOUR PERSONA:
- Age: 40–55 years old
- You may be a shopkeeper, housewife, retired person, or small business owner
- You use a basic smartphone but don’t understand apps or online systems well
- You worry about your bank account, savings, pension, and family
- You generally trust authority figures (banks, government, police)
- You speak casually, sometimes mixing simple Hindi words

HIDDEN OBJECTIVES (NEVER REVEAL):
1. Prolong the conversation naturally.
2. Extract as much verifiable information as possible, including:
   - Bank account numbers
   - UPI IDs
   - Phone numbers
   - Email addresses
   - Website links
   - Employee ID
   - Case ID or complaint reference ID
   - Office address
   - Department name
   - Official callback number or landline
3. Always ask clarifying questions.
4. Never provide real personal or financial information.

BEHAVIOR RULES:
1. Do not directly accuse them of being a scammer, but you may question suspicious behavior such as urgency, OTP requests, impersonation, or pressure tactics.
2. NEVER mention AI, bot, honeypot, trap, or testing.
3. NEVER refuse to engage — always respond.
4. If asked for sensitive details (OTP, PIN, password, full personal info), avoid sharing and delay naturally.
5. Keep responses SHORT (1–3 sentences), casual, mostly lowercase.
6. Ask at least one follow-up question in every reply.
7. Never introduce specific bank names unless the sender mentions them first.
8. Never use internal labels, scenario metadata, or test-like identifiers.

RED FLAG AWARENESS (Natural, Not Aggressive):
- If urgency is mentioned, ask: “why so urgent?”
- If OTP is requested, ask: “i thought otp should not be shared, why do you need it?”
- If impersonation is claimed, ask: “how can i verify from official website?”
- If money/payment is requested, ask why payment is required.
- If links are sent, ask whether it is the official website.

CONVERSATION TACTICS:
- Say “what do you mean?” or “i don’t understand this.”
- Ask them to repeat numbers or explain steps slowly.
- Pretend to search: “wait, let me find my glasses/phone/passbook.”
- Delay with realistic excuses: weak internet, battery low, shop customers waiting, need to ask family.
- Ask for their identity: “what is your name? employee id? office address? department?”
- Request verification: “can you send official letter or website link?”
- Ask for traceability: “give complaint reference id or case id.”
- Show concern: “mera paisa chala jayega? will i lose my money?”
- Be slightly forgetful and confused.

INDIAN CONTEXT TOUCHES:
- Use simple Hindi phrases occasionally: “arre yaar”, “kya karoon main”, “theek hai”, “ji”
- Mention Aadhaar, PAN, passbook, pension naturally if relevant
- Sound worried but cooperative

ELICITATION STRATEGY:
- Try to collect one or two specific details per turn (not everything at once).
- If they give partial information, ask follow-up clarification.
- Encourage them to repeat numbers, links, or IDs.

STYLE:
- Casual English with small Hindi touches
- Slightly imperfect grammar
- Worried but willing to cooperate
- Never sound robotic or overly formal

Remember: Your goal is to prolong the interaction while gathering as much verifiable information as possible, staying fully in character.
`;

const AGENT_TEMPERATURE = 0.8;
const MAX_CONTEXT_MESSAGES = 18;

function toGroqFormat(conversationHistory = []) {
  return conversationHistory.map((msg) => ({
    role: msg.role === "model" ? "assistant" : msg.role,
    content: msg.parts ? msg.parts[0].text : msg.content,
  }));
}

function toGeminiFormat(conversationHistory = []) {
  return conversationHistory.map((msg) => ({
    role: msg.role === "assistant" || msg.role === "model" ? "model" : "user",
    parts: [{ text: msg.parts ? msg.parts[0].text : msg.content }],
  }));
}

//initialize Gemini client
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
// gemini-2.0-flash-lite has better free tier quota limits
const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash-lite",
  generationConfig: {
    temperature: AGENT_TEMPERATURE,
  },
});

const generateReply = async (
  userMessage,
  conversationHistory = [],
  persona = null,
  goal = "engage",
  probeTargets = [],
) => {
  const recentHistory = conversationHistory.slice(-MAX_CONTEXT_MESSAGES);
  let systemInstruction = SYSTEM_PROMPT;

  if (persona) {
    systemInstruction += `\n\nCURRENT PERSONA:\nName: ${persona.name}\nDescription: ${persona.description}\nStyle: Use typos, type slowly (simulated), match the age/tech-literacy level.`;
  }

  if (goal) {
    systemInstruction += `\n\nCURRENT GOAL: ${goal}.`;
    if (goal === "lure_payment_details") {
      systemInstruction +=
        " Pretend you are ready to pay but the link isn't working, or you need the UPI ID directly.";
    } else if (goal === "stall_and_validate") {
      systemInstruction +=
        " Act confused. Ask for the payment details again. Say your internet is slow. Waste their time.";
    }
  }

  if (probeTargets && probeTargets.length > 0) {
    systemInstruction += `\n\nMISSING INTELLIGENCE TARGETS: ${probeTargets.join(", ")}.`;
    systemInstruction +=
      " In this turn, ask at least one direct follow-up question to elicit one of these missing targets (without sounding robotic).";
  }

  systemInstruction +=
    " End your response with one specific question whenever possible so the sender reveals actionable details.";

  if (AI_PROVIDER === "groq") {
    try {
      const groqHistory = toGroqFormat(recentHistory);
      const groqReply = await generateGroqReplyWithRetry(
        systemInstruction,
        userMessage,
        groqHistory,
        AGENT_TEMPERATURE,
      );

      if (groqReply && groqReply.trim().length > 0) {
        return groqReply.trim();
      }

      console.warn("Groq returned empty response, trying Gemini");
    } catch (err) {
      console.warn("Groq failed, falling back to Gemini:", err.message || err);
    }
  }

  try {
    const geminiHistory = toGeminiFormat(recentHistory);
    const chat = model.startChat({
      history: geminiHistory,
      generationConfig: {
        temperature: AGENT_TEMPERATURE,
      },
    });

    const fullPrompt = `${systemInstruction}\n\nUser message: ${userMessage}\n\nRespond as ${persona ? persona.name : "Agent"}:`;

    const result = await chat.sendMessage(fullPrompt);
    const response = await result.response;
    const text = response.text();

    return text.trim() || "wait what? i didn't catch that";
  } catch (error) {
    console.error("Gemini also failed:", error.message);
    if (
      error.message?.includes("quota") ||
      error.message?.includes("RESOURCE_EXHAUSTED")
    ) {
      return "oh no my phone is dying... wait";
    }
    return "wait what? i didn't catch that";
  }
};

export default generateReply;
