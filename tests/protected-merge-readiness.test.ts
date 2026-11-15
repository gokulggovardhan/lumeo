import assert from "node:assert/strict";
import test from "node:test";
import { assessProtectedMergeReadiness } from "../scripts/verify-protected-merge-readiness.mjs";

const H = "a".repeat(40);
const MAIN = "b".repeat(40);
function fixture() {
  return {
    pr: {
      state: "open", draft: false, merged: false, mergeable: true,
      head: { sha: H }, base: { ref: "main", sha: MAIN },
      user: { login: "original-author" },
    },
    mainSha: MAIN,
    reviews: [{ state: "APPROVED", commit_id: H, submitted_at: "2026-11-15T05:00:00Z",
      user: { login: "independent-reviewer", type: "User" } }],
    checkRuns: [{ name: "Validate Lumeo PDF Workspace", status: "completed",
      conclusion: "success", head_sha: H, app: { id: 15368 } }],
    ruleset: {
      enforcement: "active",
      conditions: { ref_name: { include: ["~DEFAULT_BRANCH"] } },
      bypass_actors: [],
      rules: [
        { type: "pull_request", parameters: { required_approving_review_count: 1,
          allowed_merge_methods: ["squash"] } },
        { type: "required_status_checks", parameters: {
          strict_required_status_checks_policy: true,
          required_status_checks: [{ context: "Validate Lumeo PDF Workspace",
            integration_id: 15368 }],
        } },
      ],
    },
  };
}

test("Phase 14 permits only exact-head, human-approved, non-bypassable squash release", () => {
  assert.deepEqual(assessProtectedMergeReadiness(fixture()), {
    safe: true, blockers: [], head: H,
  });
});

test("Phase 14 refuses zero-approval rulesets even if GitHub technically permits a merge", () => {
  const f = fixture();
  f.ruleset.rules[0].parameters.required_approving_review_count = 0;
  const result = assessProtectedMergeReadiness(f);
  assert.equal(result.safe, false);
  assert.match(result.blockers.join(" "), /at least one independent approval/);
});

test("Phase 14 refuses comment-only, self-approval and stale-commit approvals", () => {
  for (const review of [
    { state: "COMMENTED", commit_id: H, user: { login: "reviewer" } },
    { state: "APPROVED", commit_id: H, user: { login: "original-author" } },
    { state: "APPROVED", commit_id: "c".repeat(40), user: { login: "reviewer" } },
  ]) {
    const f = fixture();
    f.reviews = [{ ...review, submitted_at: "2026-11-15T05:00:00Z" }];
    assert.equal(assessProtectedMergeReadiness(f).safe, false);
  }
});

test("Phase 14 rejects stale main base, draft, check failure and untrusted integration", () => {
  for (const patch of [
    (f) => { f.pr.base.sha = "c".repeat(40); },
    (f) => { f.pr.draft = true; },
    (f) => { f.checkRuns[0].conclusion = "failure"; },
    (f) => { f.checkRuns[0].head_sha = "c".repeat(40); },
    (f) => { f.checkRuns[0].app.id = 123; },
    (f) => { f.ruleset.bypass_actors = [{ actor_id: 1 }]; },
    (f) => { f.ruleset.rules[1].parameters.strict_required_status_checks_policy = false; },
    (f) => { f.ruleset.rules[0].parameters.allowed_merge_methods = ["squash", "merge"]; },
  ]) {
    const f = fixture();
    patch(f);
    assert.equal(assessProtectedMergeReadiness(f).safe, false);
  }
});
