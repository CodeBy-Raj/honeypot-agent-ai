# Scam Honeypot AI

AI-powered honeypot backend for scam detection, multi-turn engagement, intelligence extraction, and mandatory final callback reporting.

## Features

- Detects scam intent from incoming messages
- Activates autonomous agent only when scam is detected
- Maintains multi-turn session continuity using `sessionId` and `conversationHistory`
- Extracts:
  - `phishingLinks`
  - `upiIds`
  - `phoneNumbers`
  - `bankAccounts`
  - `emailAddresses`
  - `suspiciousKeywords`
- Sends mandatory final callback to GUVI endpoint
- Supports Groq multi-key rotation and Gemini fallback
- Uses Undici keep-alive connection pooling for lower latency

## Project Structure

- `src/index.js` — Server entrypoint and Undici global dispatcher
- `src/app.js` — Express app, health route, middleware
- `src/routes/honeypot.js` — Public API contract and request validation
- `src/middleware/auth.js` — `x-api-key` auth middleware
- `src/services/scamOrchestrator.js` — Core orchestration pipeline
- `src/services/intelligenceExtractor.js` — Regex + LLM extraction
- `src/services/buildFinalReport.js` — Hybrid `agentNotes` generation
- `src/services/finalCallback.js` — GUVI final callback sender
- `src/config/env.js` — Environment variable loader

## Prerequisites

- Node.js 18+
- npm
- Valid API keys for Groq, Gemini, and Tanaos

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from `.env.example` (or create `.env` manually).
3. Fill all required environment variables.
4. Run the server:

```bash
npm run dev
```

or

```bash
npm start
```

## Environment Variables

Required:

- `PORT`
- `API_KEY` (used by `x-api-key` auth)
- `GEMINI_API_KEY`
- `TANAOS_API_KEY`
- `GROQ_API_KEY_1`
- `AI_PROVIDER` (`groq` recommended)

Optional (recommended for key rotation):

- `GROQ_API_KEY_2`
- `GROQ_API_KEY_3`

## API Contract

### Health Check

- `GET /health`
- Response: `200 OK`

### Honeypot Endpoint

- `POST /api/honeypot`
- Headers:
  - `Content-Type: application/json`
  - `x-api-key: <API_KEY>`

#### Request Body

```json
{
  "sessionId": "session-123",
  "message": {
    "sender": "scammer",
    "text": "Your account will be blocked. Verify now.",
    "timestamp": 1770005528731
  },
  "conversationHistory": [
    {
      "sender": "scammer",
      "text": "Earlier scam message",
      "timestamp": 1770005528000
    },
    {
      "sender": "user",
      "text": "Previous agent response",
      "timestamp": 1770005528200
    }
  ],
  "metadata": {
    "channel": "SMS",
    "language": "English",
    "locale": "IN"
  }
}
```

Validation rules:

- `sessionId` is required
- `message.sender` is required, allowed: `scammer | user`
- `message.text` is required
- `message.timestamp` is required and must be a number

#### Success Response

```json
{
  "status": "success",
  "sessionId": "session-123",
  "reply": "Your conversational response to the scammer",
  "scamDetected": true,
  "totalMessagesExchanged": 6,
  "engagementDurationSeconds": 42,
  "extractedIntelligence": {
    "phoneNumbers": [],
    "bankAccounts": [],
    "upiIds": [],
    "phishingLinks": [],
    "emailAddresses": []
  },
  "agentNotes": "Optional analysis of the conversation"
}
```

When stop condition is reached:

```json
{
  "status": "success",
  "sessionId": "session-123",
  "reply": "Connection closed.",
  "scamDetected": true,
  "totalMessagesExchanged": 18,
  "engagementDurationSeconds": 345,
  "extractedIntelligence": {
    "phoneNumbers": [],
    "bankAccounts": [],
    "upiIds": [],
    "phishingLinks": [],
    "emailAddresses": []
  },
  "agentNotes": "Scam signals detected..."
}
```

## Submission Checklist

- Public HTTPS endpoint reachable without VPN/firewall restrictions
- Response time within 30 seconds for valid requests
- `POST /api/honeypot` returns HTTP 200 on valid payloads
- Response JSON always includes: `status`, `reply`, `scamDetected`, `extractedIntelligence`, `agentNotes`
- `extractedIntelligence` includes all five arrays: `phoneNumbers`, `bankAccounts`, `upiIds`, `phishingLinks`, `emailAddresses`
- Repository should be public and README should be up to date before submission

## Quick Test (curl)

```bash
curl -X POST "http://localhost:3000/api/honeypot" \
  -H "Content-Type: application/json" \
  -H "x-api-key: dev-secret-key" \
  -d '{
    "sessionId":"demo-1",
    "message":{
      "sender":"scammer",
      "text":"urgent! verify your account now",
      "timestamp":1770005528731
    },
    "conversationHistory":[]
  }'
```

## Multi-turn Session Testing

Use the same `sessionId` for all turns and keep appending prior turns into `conversationHistory`.

Checklist:

- Same `sessionId` across turns
- Always include latest incoming `message`
- Include full previous exchange in `conversationHistory`
- Verify final response eventually becomes `Connection closed.`

## Local Evaluation Scripts

Run the local rubric-aligned evaluator before submission:

```bash
node scripts/run_scenarios.js
```

Scripts included:

- `scripts/scenarios.js` - scenario definitions
- `scripts/evaluate_final_output.js` - scoring engine
- `scripts/run_scenarios.js` - API runner + score output

## Final Callback (Mandatory for scoring)

System posts final report to:

- `POST https://hackathon.guvi.in/api/updateHoneyPotFinalResult`

Includes:

- `sessionId`
- `scamDetected`
- `totalMessagesExchanged`
- `engagementDurationSeconds`
- `extractedIntelligence`
- `agentNotes` (hybrid: LLM summary + fallback rules)

## Deployment Notes

- Expose port from `PORT`
- Keep all secrets in deployment env vars
- Do not hardcode API keys
- Ensure outbound access to AI providers and GUVI callback endpoint
- Keep frontend/testing client separate from backend deployment (recommended)

## Troubleshooting

- Validation/auth failures:
  - Endpoint still returns HTTP 200 with a consistent JSON envelope and explanatory `agentNotes`
- High latency:
  - Expected with multi-model calls; check provider response times and region
- Callback failures:
  - Verify network egress and endpoint reachability

## Security Notes

- Never commit `.env`
- Rotate exposed keys immediately
- Keep API key server-side only (especially when using web test UI/proxy)
