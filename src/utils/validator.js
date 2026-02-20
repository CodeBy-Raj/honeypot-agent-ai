const AMBIGUOUS_PATTERNS = [
  /registered\s+mobile/i,
  /\baccount\s+number\b/i,
  /\b\d+\s*[- ]?digit\s+account\s+number\b/i,
  /\botp\b/i,
  /verify\s+identity/i,
  /protect\s+your\s+funds/i,
  /immediately/i,
];

function isAmbiguousValue(value = "") {
  return AMBIGUOUS_PATTERNS.some((pattern) => pattern.test(value));
}

function normalizePhoneForValidation(value = "") {
  return value.replace(/[\s()-]/g, "");
}

function isValidIndianPhone(value = "") {
  const normalized = normalizePhoneForValidation(value).replace(/^\+/, "");

  if (/^91[6-9]\d{9}$/.test(normalized)) return true;
  if (/^[6-9]\d{9}$/.test(normalized)) return true;

  return false;
}

function isValidBankAccountNumber(value = "") {
  const normalized = value.replace(/\D/g, "");

  if (!/^\d{11,20}$/.test(normalized)) return false;
  if (isValidIndianPhone(normalized)) return false;
  if (/^(\d)\1{10,}$/.test(normalized)) return false;

  return true;
}

function isLikelyBankName(value = "") {
  const normalized = value.trim();
  const compact = normalized.replace(/\s+/g, " ").toLowerCase();

  if (/^[A-Z]{2,6}$/.test(normalized)) return true;
  if (
    /\b(my|your|their|our|his|her|this|that|handles?|account)\b/i.test(
      normalized,
    )
  ) {
    return false;
  }

  if (
    [
      "state bank of india",
      "bank of baroda",
      "punjab national bank",
      "union bank",
      "canara bank",
      "hdfc bank",
      "icici bank",
      "axis bank",
      "kotak mahindra bank",
      "yes bank",
      "idfc first bank",
      "indusind bank",
      "sbi",
      "hdfc",
      "icici",
      "axis",
      "pnb",
      "kotak",
      "idfc",
      "indusind",
      "bob",
    ].includes(compact)
  ) {
    return true;
  }

  return false;
}

function isValidEmail(value = "") {
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value);
}

function dedupeCaseInsensitive(values = []) {
  const seen = new Set();
  const result = [];

  for (const raw of values) {
    const value = String(raw || "").trim();
    if (!value) continue;

    const key = value.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(value);
  }

  return result;
}

export function sanitizePhoneCandidates(candidates = []) {
  const filtered = candidates
    .map((v) => String(v || "").trim())
    .filter((v) => v.length > 0)
    .filter((v) => !isAmbiguousValue(v))
    .filter((v) => isValidIndianPhone(v));

  return dedupeCaseInsensitive(filtered);
}

export function sanitizeBankCandidates(candidates = []) {
  const filtered = candidates
    .map((v) => String(v || "").trim())
    .filter((v) => v.length > 0)
    .filter((v) => !isAmbiguousValue(v))
    .filter((v) => isValidBankAccountNumber(v) || isLikelyBankName(v));

  return dedupeCaseInsensitive(filtered);
}

export function sanitizeEmailCandidates(candidates = []) {
  const filtered = candidates
    .map((v) => String(v || "").trim())
    .filter((v) => v.length > 0)
    .filter((v) => !isAmbiguousValue(v))
    .filter((v) => isValidEmail(v));

  return dedupeCaseInsensitive(filtered);
}
