import { readFileSync } from "node:fs";

const EXPECTED_CPU_MS = 30_000;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function assertCpuBudget(config, label) {
  const cpuMs = config?.limits?.cpu_ms;
  if (typeof cpuMs !== "number" || cpuMs < EXPECTED_CPU_MS) {
    throw new Error(
      `${label} must preserve limits.cpu_ms >= ${EXPECTED_CPU_MS}; received ${String(cpuMs)}.`,
    );
  }
}

const root = readJson("wrangler.jsonc");
assertCpuBudget(root, "Root Worker configuration");

const generatedPath = process.argv[2];
if (generatedPath) {
  const generated = readJson(generatedPath);
  assertCpuBudget(generated, "Generated Worker configuration");
}

console.log(`PASS Cloudflare Worker CPU budget is pinned to at least ${EXPECTED_CPU_MS}ms`);
