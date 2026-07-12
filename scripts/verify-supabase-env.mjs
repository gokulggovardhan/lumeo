import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ENV_PATH = resolve(process.cwd(), ".env.local");
const REQUIRED_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
];

function readLocalEnv() {
  try {
    return readFileSync(ENV_PATH, "utf8");
  } catch {
    throw new Error(".env.local was not found.");
  }
}

function parseEnvValue(line) {
  const index = line.indexOf("=");

  if (index === -1) return null;

  const key = line.slice(0, index).trim();
  let value = line.slice(index + 1).trim();

  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return { key, value };
}

function parseLocalEnv(contents) {
  const values = new Map();

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const parsed = parseEnvValue(trimmed);
    if (parsed) {
      values.set(parsed.key, parsed.value);
    }
  }

  return values;
}

function requireValue(values, key) {
  const value = values.get(key);

  if (!value) {
    throw new Error(`${key} is missing from .env.local.`);
  }

  return value;
}

function assertHttpsUrl(value) {
  let parsed;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid HTTPS URL.");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must use HTTPS.");
  }
}

try {
  const values = parseLocalEnv(readLocalEnv());

  for (const key of REQUIRED_KEYS) {
    requireValue(values, key);
  }

  assertHttpsUrl(values.get("NEXT_PUBLIC_SUPABASE_URL"));

  console.log("PASS Supabase URL configured");
  console.log("PASS Supabase publishable key configured");
  console.log("PASS Supabase environment is ready");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Supabase environment check failed.");
  process.exit(1);
}
