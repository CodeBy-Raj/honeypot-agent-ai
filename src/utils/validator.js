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
  return /^\d{9,20}$/.test(value);
}

function isLikelyBankName(value = "") {
  const normalized = value.trim();

  if (/^[A-Z]{2,6}$/.test(normalized)) return true;
  if (/^[A-Za-z]{3,}(?:\s+[A-Za-z]{2,}){0,2}\s+bank$/i.test(normalized))
    return true;

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
