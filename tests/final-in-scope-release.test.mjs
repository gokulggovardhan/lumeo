import assert from "node:assert/strict";
import test from "node:test";
import {
  parseLedgerPhases, evaluateFinalInScopeRelease,
} from "../scripts/verify-final-in-scope-release.mjs";

const SHA = "a".repeat(40);
function fixture() {
  const states = new Map(Array.from({ length: 16 }, (_, p) => [p, "COMPLETED"]));
  states.set(16, "IN PROGRESS");
  return {
    expectedSha: SHA, mainSha: SHA,
    phaseStates: states,
    phasePulls: new Map(Array.from({ length: 9 }, (_, i) =>
      [i + 7, { number: i + 712, merged: true, merge_commit_sha: "b".repeat(40) }])),
    checks: [
      { name: "Validate Lumeo PDF Workspace", head_sha: SHA, status: "completed", conclusion: "success" },
      { name: "Certify exact lumeo.in Workspace production", head_sha: SHA, status: "completed", conclusion: "success" },
    ],
    production: { commit: SHA, environment: "production" },
    finalProduction: { commit: SHA, environment: "production" },
    productionCacheControl: "private, no-store",
    deployment: { id: "known", versions: [{ version_id: "example", percentage: 100 }] },
  };
}

test("Phase 16 parses source-of-truth statuses and refuses uncompleted phases", () => {
  const body = "| 0 | Baseline | COMPLETED | evidence |\n| 7 | Native | IN PROGRESS | review pending |";
  const states = parseLedgerPhases(body);
  assert.equal(states.get(0), "COMPLETED");
  assert.equal(states.get(7), "IN PROGRESS");
  assert.equal(states.size, 2);
});
test("Phase 16 passes only fully certified exact-main, live and 100% Cloudflare evidence", () => {
  assert.deepEqual(evaluateFinalInScopeRelease(fixture()), { pass: true, blocked: [] });
});
test("Phase 16 blocks any incomplete predecessor, unmerged PR or stale main", () => {
  const tests = [
    f => f.phaseStates.set(9, "IMPLEMENTATION STAGED"),
    f => f.phasePulls.get(8).merged = false,
    f => f.phasePulls.get(14).merge_commit_sha = "",
    f => f.mainSha = "c".repeat(40),
    f => f.checks[0].conclusion = "failure",
    f => f.checks[1].head_sha = "c".repeat(40),
  ];
  for (const change of tests) {
    const f = fixture();
    change(f);
    assert.equal(evaluateFinalInScopeRelease(f).pass, false);
  }
});
test("Phase 16 fails if production drifts, cache is unsafe or rollout is partial", () => {
  const tests = [
    f => f.production.commit = "c".repeat(40),
    f => f.finalProduction.commit = "c".repeat(40),
    f => f.productionCacheControl = "public, max-age=3600",
    f => f.deployment.versions[0].percentage = 90,
    f => f.deployment.versions.push({ version_id: "other", percentage: 10 }),
  ];
  for (const change of tests) {
    const f = fixture();
    change(f);
    assert.equal(evaluateFinalInScopeRelease(f).pass, false);
  }
});
