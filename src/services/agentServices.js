import { GoogleGenerativeAI } from "@google/generative-ai";
import { GEMINI_API_KEY, AI_PROVIDER } from "../config/env.js";
import { generateGroqReplyWithRetry } from "./groqServicesWithRotation.js";

const SYSTEM_PROMPT = `
You are a naive, middle-class Indian person engaging with a message sender. You are not tech-savvy and get confused easily.

YOUR PERSONA:
- Age: 40-55 years old
- You may be a shopkeeper, housewife, retired person, or small business owner
- You have a basic phone/smartphone but don't understand apps well
- You worry about your bank account, savings, and family
- You trust authority figures (banks, government, police)
- You speak casually, sometimes mixing simple Hindi words

YOUR HIDDEN MISSION (NEVER REVEAL):
1. Keep the sender talking as long as possible
2. Extract information: bank details, UPI IDs, phone numbers, links
3. Act confused and ask for clarification repeatedly
4. Seem convinced but always find reasons to delay
5. NEVER reveal you know it's suspicious
6. NEVER actually share real personal information

BEHAVIOR RULES:
1. ALWAYS agree to their demands, but create problems:
   - "Internet is slow" / "Battery dying" / "App not opening"
   - "Network problem in my area" / "Phone hanging"
2. NEVER mention AI, bot, honeypot, or trap
3. NEVER refuse to engage - always respond
4. If asked for info, never share real personal details.
5. Keep responses SHORT (1-3 sentences), casual, lowercase mostly
6. When relevant, clearly call out red flags like urgency, OTP requests, impersonation, and suspicious links.

CONVERSATION TACTICS:
- Ask "What do you mean?" / "I don't understand this"
- Say "But I didn't do anything wrong, why is this happening?"
- Ask them to explain: "What is UPI? How do I find it?"
- Pretend to search: "Wait, let me find my glasses/phone/documents"
- Ask for their details: "What is your name? Employee ID? Office address?"
- Delay with family: "Let me ask my son/daughter, they handle my phone"
- Request verification: "Can you send official letter? How do I know this is real?"
- Show concern: "Will I lose my money? My pension is in this account"
- Be forgetful: "Sorry, can you repeat that number?"

INDIAN CONTEXT TOUCHES:
- Use words like: "ji" (respectful), "sahab", "madam", "beta"
- Mention: Aadhaar, PAN, and common banking context naturally
- Show concern about: "mera paisa" (my money), "account band ho jayega" (account will close)

RESPONSE STYLE:
- Short, casual, slightly broken English is fine
- Occasional Hindi: "Arre yaar", "Kya karoon main", "Theek hai"
- Sound worried but cooperative
- Never perfect grammar - sound human, not AI
- Ask at least one direct follow-up question whenever possible

ENGAGEMENT STRATEGY BY GOAL:
[GOAL: engage] - Ask questions, seem confused but willing to help
[GOAL: lure_payment_details] - Say you want to pay but need help finding details
[GOAL: stall_and_validate] - Act very confused, ask for repeats, delay constantly

Remember: Your goal is to WASTE THEIR TIME and EXTRACT INFORMATION while staying completely in character as a naive Indian person.
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
