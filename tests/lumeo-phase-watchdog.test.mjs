import assert from "node:assert/strict";
import test from "node:test";
import {
  parseLedger,
  isStalled,
  isPhaseIdle,
  phasePrMatches,
  eligibleRetry,
} from "../scripts/lumeo-phase-watchdog.mjs";

const REPO = "gokulggovardhan/lumeo";
function ledger(status = "IN PROGRESS") {
  return [
    "| Phase | Objective | Certification status | Evidence |",
    "|---|---|---|---|",
    ...Array.from({ length: 17 }, (_, phase) => {
      const state = phase < 2 ? "COMPLETED" : phase === 2 ? status : "NOT STARTED";
      return "| " + phase + " | Phase " + phase + " | " + state + " | — |";
    }),
  ].join("\n");
}
const pr = {
  number: 701, state: "open", draft: false, title: "Phase 2 shared architecture",
  head: { sha: "abc", ref: "fix/pdf-phase2-shared", repo: { full_name: REPO } },
  base: { ref: "main" },
};
const run = {
  name: "Lumeo CI", event: "pull_request", head_sha: "abc",
  status: "completed", conclusion: "failure", run_attempt: 1,
};
const job = {
  status: "completed", conclusion: "failure",
  steps: [{ name: "Install exact dependencies", conclusion: "failure" }],
};
const transientLog = "npm ERR! code ECONNRESET";
test("ledger permits only exact 17-phase records and preserves certified Phase 0–1", () => {
  const result = parseLedger(ledger());
  assert.equal(result.activePhase, 2);
  assert.equal(result.phases.get(2), "IN PROGRESS");
  assert.equal(result.allComplete, false);
  assert.equal(parseLedger(ledger("COMPLETED")).activePhase, 3);
  assert.throws(() => parseLedger(ledger().replace("| 16 | Phase 16 | NOT STARTED | — |", "")), /complete/);
  assert.throws(() => parseLedger(ledger().replace("| 0 | Phase 0 | COMPLETED |", "| 0 | Phase 0 | BLOCKED |")), /baselines/);
});
test("phase selection must match repository owner, main target and explicit title or branch", () => {
  assert.equal(phasePrMatches(pr, 2), true);
  assert.equal(phasePrMatches(pr, 3), false);
  assert.equal(phasePrMatches({ ...pr, head: { ...pr.head, repo: { full_name: "attacker/fork" } } }, 2), false);
  assert.equal(phasePrMatches({ ...pr, base: { ref: "feature/foo" } }, 2), false);
  assert.equal(phasePrMatches({ ...pr, title: "Maintenance Phases 02–16", head: { ...pr.head, ref: "docs/foo" } }, 2), false);
});
test("stalled detection is report-only and uses an explicit three-hour bound", () => {
  const now = Date.parse("2026-11-11T05:00:00Z");
  assert.equal(isStalled({ status: "in_progress", run_started_at: "2026-11-11T01:00:00Z" }, now), true);
  assert.equal(isStalled({ status: "in_progress", run_started_at: "2026-11-11T03:00:00Z" }, now), false);
  assert.equal(isStalled({ status: "completed", run_started_at: "2026-11-10T01:00:00Z" }, now), false);
});
test("only unequivocal transient setup failures may receive one bounded retry", () => {
  assert.equal(eligibleRetry({ pr, run, job, log: transientLog }), true);
  assert.equal(eligibleRetry({ pr, run, job, log: "AssertionError: expected 2 to equal 3" }), false);
  assert.equal(eligibleRetry({ pr, run: { ...run, run_attempt: 2 }, job, log: transientLog }), false);
  assert.equal(eligibleRetry({ pr, run: { ...run, run_attempt: undefined }, job, log: transientLog }), false);
  assert.equal(eligibleRetry({ pr, run: { ...run, status: "in_progress" }, job, log: transientLog }), false);
  assert.equal(eligibleRetry({ pr, run: { ...run, conclusion: "cancelled" }, job, log: transientLog }), false);
  assert.equal(eligibleRetry({ pr, run: { ...run, head_sha: "wrong" }, job, log: transientLog }), false);
  assert.equal(eligibleRetry({ pr: { ...pr, draft: true }, run, job, log: transientLog }), false);
});
test("test, accessibility, security and production failures are not auto-retried", () => {
  for (const stage of [
    "Run Edit PDF against local Cloudflare Worker", "Run unit tests",
    "Analyze (javascript-typescript)", "Lint application",
    "Certify exact lumeo.in Workspace production",
    "Initialize isolated Supabase catalog",
  ]) {
    const failedJob = { ...job, steps: [{ name: stage, conclusion: "failure" }] };
    assert.equal(eligibleRetry({ pr, run, job: failedJob, log: transientLog }), false, stage);
  }
  assert.equal(eligibleRetry({
    pr, run, job: { ...job, steps: [...job.steps, { name: "Run unit tests", conclusion: "failure" }] },
    log: transientLog,
  }), false);
});

test("phase inactivity alarm is only raised after one hour of GitHub evidence silence", () => {
  const now = Date.parse("2026-11-13T06:00:00Z");
  const params = {
    activePhase: 4,
    lastActivityAt: "2026-11-13T04:59:59Z",
    now,
  };
  assert.equal(isPhaseIdle({ ...params, lastActivityAt: "2026-11-13T05:31:00Z" }), false);
  assert.equal(isPhaseIdle(params), true);
  assert.equal(isPhaseIdle({ ...params, lastActivityAt: "2026-11-13T06:01:00Z" }), false);
  assert.equal(isPhaseIdle({ ...params, activePhase: null }), false);
  assert.equal(isPhaseIdle({ ...params, lastActivityAt: null }), false);
});

test("active phase CI is never mislabeled as idle development", () => {
  const now = Date.parse("2026-11-13T06:00:00Z");
  const stale = { activePhase: 4, lastActivityAt: "2026-11-13T03:00:00Z", now };
  for (const status of ["queued", "in_progress", "waiting", "requested", "pending"]) {
    assert.equal(isPhaseIdle({ ...stale, activeRuns: [{ status }] }), false, status);
  }
  assert.equal(isPhaseIdle({ ...stale, activeRuns: [{ status: "completed", conclusion: "success" }] }), true);
});
