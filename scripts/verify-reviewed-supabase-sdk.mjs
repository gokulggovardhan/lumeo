import { readFileSync } from "node:fs";
import { join } from "node:path";

// Single reviewed exact version contract; changes require approved dependency
// upgrade PR, lockfile consistency and successful browser/production gates.
export const REVIEWED_SUPABASE_JS_VERSION = "2.119.0";

export function assertReviewedSupabaseSdkVersion(
  manifest,
  lock = JSON.parse(readFileSync(join(process.cwd(), "package-lock.json"), "utf8")),
) {
  const expected = `^${REVIEWED_SUPABASE_JS_VERSION}`;
  if (manifest?.dependencies?.["@supabase/supabase-js"] !== expected) {
    throw new Error("Supabase JS declared version changed unexpectedly.");
  }
  if (lock?.packages?.[""]?.dependencies?.["@supabase/supabase-js"] !== expected) {
    throw new Error("Supabase JS lockfile root does not match the reviewed version.");
  }
  if (lock?.packages?.["node_modules/@supabase/supabase-js"]?.version !== REVIEWED_SUPABASE_JS_VERSION) {
    throw new Error("Supabase JS installed lockfile version is not the reviewed release.");
  }
}
