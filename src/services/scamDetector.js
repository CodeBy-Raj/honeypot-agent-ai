import { TANAOS_API_KEY } from "../config/env.js";

const tanaos_url = "https://slm.tanaos.com/models/spam-detection";

const RISK_PATTERNS = [
  {
    regex: /\burgent\b|\bimmediately\b|\bwithin\s+\d+\s+(minutes?|hours?)\b/i,
    weight: 2,
    reason: "urgency_pressure",
  },
  {
    regex: /\botp\b|\bverification\s*code\b|\bcode\s+you\s+received\b/i,
    weight: 3,
    reason: "otp_request",
  },
  {
    regex:
      /\bshare\b|\bsend\b|\breply\b.{0,30}\b(account|upi|bank|aadhaar|pan|code|otp)\b/i,
    weight: 3,
    reason: "sensitive_data_request",
  },
  {
    regex: /\baccount\s+(blocked|locked|suspended|compromised)\b/i,
    weight: 2,
    reason: "account_threat",
  },
  { regex: /https?:\/\//i, weight: 1, reason: "external_link" },
  {
    regex: /\b(crypto|investment|returns?|profit)\b/i,
    weight: 1,
    reason: "investment_lure",
  },
  {
    regex: /\bwon\b|\bwinner\b|\bcashback\b|\blottery\b/i,
    weight: 1,
    reason: "prize_lure",
  },
  {
    regex:
      /\bremote\s+data\s+entry\b|\bjob\b.{0,25}\b(onboarding|deposit|fee)\b/i,
    weight: 2,
    reason: "job_fee_pattern",
  },
  {
    regex:
      /\bcharge\b|\brenewal\b|\bpayment\b.{0,35}\b(if\s+this\s+was\s+not\s+you|cancel)\b/i,
    weight: 2,
    reason: "invoice_callback_pattern",
  },
];

const BENIGN_PATTERNS = [
  {
    regex: /\bno\s+personal\s+details\s+needed\b/i,
    weight: 2,
    reason: "explicit_no_sensitive_request",
  },
  {
    regex: /\bofficial\b.{0,20}\b(bank\s+website|website)\b/i,
    weight: 2,
    reason: "official_channel_advice",
  },
  {
    regex:
      /\bdinner\s+split\b|\bsplit\s+bill\b|\bfamily\b|\breached\s+office\b/i,
    weight: 1,
    reason: "personal_context",
  },
];

function evaluateHeuristics(text = "") {
  let riskScore = 0;
  const reasons = [];

  for (const item of RISK_PATTERNS) {
    if (item.regex.test(text)) {
      riskScore += item.weight;
      reasons.push(item.reason);
    }
  }

  for (const item of BENIGN_PATTERNS) {
    if (item.regex.test(text)) {
      riskScore -= item.weight;
      reasons.push(item.reason);
    }
  }

  return { riskScore, reasons };
}

const detectScam = async (text) => {
  if (!text) return { isScam: false, score: 0, reasons: [] };

  const heuristic = evaluateHeuristics(text);

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
      const fallbackScam = heuristic.riskScore >= 2;
      return {
        isScam: fallbackScam,
        score: Math.max(0, Math.min(1, heuristic.riskScore * 0.12)),
        reasons: [...heuristic.reasons, `model_http_${response.status}`],
      };
    }

    const jsonResponse = await response.json();
    const result = jsonResponse.data && jsonResponse.data[0];

    if (!result) {
      const fallbackScam = heuristic.riskScore >= 2;
      return {
        isScam: fallbackScam,
        score: Math.max(0, Math.min(1, heuristic.riskScore * 0.1)),
        reasons: [...heuristic.reasons, "model_empty_response"],
      };
    }

    const isScam = result.label === "spam";
    const modelScore = Number(result.score || 0);

    const combinedScam =
      isScam ||
      heuristic.riskScore >= 3 ||
      (heuristic.riskScore >= 2 && modelScore >= 0.45);

    const normalizedScore = Math.max(
      0,
      Math.min(1, modelScore + heuristic.riskScore * 0.08),
    );

    return {
      isScam: combinedScam,
      score: normalizedScore,
      reasons: [
        ...(isScam ? ["model_detected_spam"] : []),
        ...heuristic.reasons,
      ],
    };
  } catch (error) {
    console.error("Scam detection Error:", error);

    const fallbackScam = heuristic.riskScore >= 3;
    return {
      isScam: fallbackScam,
      score: Math.max(0, Math.min(1, heuristic.riskScore * 0.1)),
      reasons: [...heuristic.reasons, "model_unavailable_fallback"],
    };
  }
};
export default detectScam;
