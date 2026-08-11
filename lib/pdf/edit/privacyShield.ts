// lib/pdf/edit/privacyShield.ts
//
// Self-contained (no project-file imports), matching every other pure
// logic module in this directory -- see lib/pdf/edit/elements.ts's own
// top comment for why. Deterministic regex pattern matching only, no
// ML/AI -- this module's whole job is to be honestly exactly what it
// says: fixed patterns, explainable matches, zero network calls.
//
// Deliberately conservative on account-number matching (10+ digits) to
// avoid flagging short codes like division codes or page numbers, but
// this is shape-based, not meaning-based -- see this module's own test
// file for the documented false-positive risk (a random 10-digit
// sequence that isn't really an account number still matches).

export type PrivacyShieldMatch<TRun> = {
  run: TRun;
  category: "account-number" | "currency" | "phone";
};

// Order matters: currency and phone patterns are checked first since
// they're more specific (decimal point, or a recognizable phone shape)
// than the broad "10+ digit sequence" account-number fallback -- a
// string matching both only gets counted once, in its most specific
// category.
const CURRENCY_PATTERN = /(?:₹|Rs\.?|INR|\$)?\s?\d{1,3}(?:,\d{2,3})*\.\d{2}\b/;
const PHONE_PATTERN = /\b(?:\+?\d{1,3}[-\s]?)?\d{10}\b/;
const ACCOUNT_NUMBER_PATTERN = /\b\d{10,}\b/;

export function scanForSensitiveInfo<TRun extends { str: string }>(runs: TRun[]): Array<PrivacyShieldMatch<TRun>> {
  const matches: Array<PrivacyShieldMatch<TRun>> = [];
  for (const run of runs) {
    if (CURRENCY_PATTERN.test(run.str)) {
      matches.push({ run, category: "currency" });
    } else if (PHONE_PATTERN.test(run.str) && run.str.replace(/\D/g, "").length === 10) {
      matches.push({ run, category: "phone" });
    } else if (ACCOUNT_NUMBER_PATTERN.test(run.str)) {
      matches.push({ run, category: "account-number" });
    }
  }
  return matches;
}
