const SENSITIVE_ASSIGNMENT =
  /(\b(?:password|passwd|pwd|secret|token|api[_-]?key|authorization|cookie|set-cookie)\b\s*[:=]\s*)([^\s,;]+)/gi;
const BEARER_TOKEN = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const SUPABASE_SECRET = /\bsb_secret_[A-Za-z0-9_-]+\b/g;
const DATABASE_CREDENTIALS = /\b(postgres(?:ql)?:\/\/)([^\s/@:]+):([^\s/@]+)@/gi;

export function sanitizeErrorDiagnostic(
  value: string | null | undefined,
  maxLength = 4000,
): string | null {
  if (!value) return null;

  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(DATABASE_CREDENTIALS, "$1[REDACTED]@")
    .replace(BEARER_TOKEN, "Bearer [REDACTED]")
    .replace(JWT, "[REDACTED_JWT]")
    .replace(SUPABASE_SECRET, "[REDACTED_SUPABASE_SECRET]")
    .replace(SENSITIVE_ASSIGNMENT, "$1[REDACTED]")
    .slice(0, maxLength);
}
