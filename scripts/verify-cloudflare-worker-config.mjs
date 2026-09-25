import { readFileSync } from "node:fs";

/**
 * Production currently uses Cloudflare Workers Free. Cloudflare rejects a
 * custom `limits.cpu_ms` on that plan (API code 100328), so Free-plan
 * compatibility is a release invariant until the account is deliberately
 * upgraded and recertified.
 */
function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function assertFreePlanCompatible(config, label) {
  const cpuMs = config?.limits?.cpu_ms;
  if (cpuMs !== undefined) {
    throw new Error(
      `${label} must not set limits.cpu_ms while production uses Cloudflare Workers Free; received ${String(cpuMs)}.`,
    );
  }
}

assertFreePlanCompatible(readJson("wrangler.jsonc"), "Root Worker configuration");

const generatedPath = process.argv[2];
if (generatedPath) {
  assertFreePlanCompatible(readJson(generatedPath), "Generated Worker configuration");
}

console.log("PASS Cloudflare Worker configuration is compatible with production Workers Free");
