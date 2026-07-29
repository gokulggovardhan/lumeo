// scripts/verify-release.mjs
//
// The permanent pre-release quality gate (docs/RELEASE_CERTIFICATION.md,
// Part 3 + Part 11). Orchestrates the checks that already exist rather than
// reimplementing any of their logic: the core test/lint/typecheck/build
// sequence, then every scripts/verify-*.mjs script in turn. Two scripts
// (verify:aura-rollout, verify:lumeo2-public-experience) are documented as
// deprecated in their own files -- their failures are reported but do not
// fail the overall gate, since they check a since-completed rollout
// milestone's hardcoded content markers, not current production behavior.
//
// Usage: npm run verify:release

import { execSync } from "node:child_process";

const DEPRECATED_SCRIPTS = new Set(["verify:aura-rollout", "verify:lumeo2-public-experience"]);

const CORE_STEPS = [
  { label: "Tests", command: "npm run test" },
  { label: "Lint", command: "npm run lint" },
  { label: "Typecheck", command: "npx tsc --noEmit" },
  { label: "Production build", command: "npm run build" },
];

const VERIFY_SCRIPTS = [
  "verify:public",
  "verify:supabase",
  "verify:admin-auth",
  "verify:control-center",
  "verify:public-catalog",
  "verify:analytics",
  "verify:aura",
  "verify:aura-rollout",
  "verify:lumeo2-foundation",
  "verify:lumeo2-public-experience",
  "verify:lumeo2-workspaces",
];

function run(command) {
  try {
    execSync(command, { stdio: "inherit" });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

const results = [];
let fatalFailure = false;

console.log("=== Lumeo Production Release Certification ===\n");

for (const step of CORE_STEPS) {
  console.log(`--- ${step.label} (${step.command}) ---`);
  const result = run(step.command);
  results.push({ label: step.label, ok: result.ok, fatal: true });
  if (!result.ok) {
    fatalFailure = true;
    console.error(`FAIL: ${step.label}\n`);
    break; // no point running later steps against a build that already failed
  }
  console.log(`PASS: ${step.label}\n`);
}

if (!fatalFailure) {
  for (const scriptName of VERIFY_SCRIPTS) {
    const isDeprecated = DEPRECATED_SCRIPTS.has(scriptName);
    console.log(`--- ${scriptName}${isDeprecated ? " (deprecated, non-fatal)" : ""} ---`);
    const result = run(`npm run ${scriptName}`);
    results.push({ label: scriptName, ok: result.ok, fatal: !isDeprecated });
    if (result.ok) {
      console.log(`PASS: ${scriptName}\n`);
    } else if (isDeprecated) {
      console.warn(`FAIL (known, non-fatal): ${scriptName}\n`);
    } else {
      fatalFailure = true;
      console.error(`FAIL: ${scriptName}\n`);
    }
  }
}

console.log("=== Summary ===");
for (const result of results) {
  const status = result.ok ? "PASS" : result.fatal ? "FAIL" : "FAIL (non-fatal)";
  console.log(`${status.padEnd(18)} ${result.label}`);
}

if (fatalFailure) {
  console.error("\nRELEASE GATE: FAILED -- do not deploy until every fatal check passes.");
  process.exit(1);
}

console.log("\nRELEASE GATE: PASSED");
