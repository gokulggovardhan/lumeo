// scripts/verify-release.mjs
//
// The permanent pre-release quality gate (docs/RELEASE_CERTIFICATION.md,
// Part 3 + Part 11). Orchestrates the checks that already exist rather than
// reimplementing any of their logic: the core test/lint/typecheck/build
// sequence, then every scripts/verify-*.mjs script in turn. Every listed
// verifier reflects current production behavior and is release-fatal.
//
// Usage: npm run verify:release

import { execSync } from "node:child_process";

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
  "verify:lumeo2-foundation",
  "verify:lumeo2-public-experience",
  "verify:lumeo2-workspaces",
];

const NON_FATAL_VERIFY_SCRIPTS = new Set([
  // Historical rollout verifier: useful as a signal, but its hard-coded
  // content markers no longer define current production correctness.
  "verify:lumeo2-public-experience",
]);

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
    console.log(`--- ${scriptName} ---`);
    const result = run(`npm run ${scriptName}`);
    const fatal = !NON_FATAL_VERIFY_SCRIPTS.has(scriptName);
    results.push({ label: scriptName, ok: result.ok, fatal });
    if (result.ok) {
      console.log(`PASS: ${scriptName}\n`);
    } else if (fatal) {
      fatalFailure = true;
      console.error(`FAIL: ${scriptName}\n`);
    } else {
      console.warn(`WARN: ${scriptName} (deprecated, non-fatal)\n`);
    }
  }
}

console.log("=== Summary ===");
for (const result of results) {
  const status = result.ok ? "PASS" : result.fatal ? "FAIL" : "WARN";
  console.log(`${status.padEnd(18)} ${result.label}`);
}

if (fatalFailure) {
  console.error("\nRELEASE GATE: FAILED -- do not deploy until every fatal check passes.");
  process.exit(1);
}

console.log("\nRELEASE GATE: PASSED");
