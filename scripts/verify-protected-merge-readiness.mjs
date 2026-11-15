// Read-only Phase 14 protected release preflight.
// This checker can block an unsafe release decision, but it cannot approve,
// merge, deploy, change GitHub permissions, or replace a human reviewer.
import { pathToFileURL } from "node:url";

const SHA_PATTERN = /^[0-9a-f]{40}$/i;
const REQUIRED_CHECK = "Validate Lumeo PDF Workspace";

export function assessProtectedMergeReadiness({ pr, reviews, checkRuns, ruleset, mainSha }) {
  const blockers = [];
  const head = pr?.head?.sha;
  const requiredReview = ruleset?.rules?.find((rule) => rule.type === "pull_request")?.parameters;
  const requiredStatus = ruleset?.rules?.find((rule) => rule.type === "required_status_checks")?.parameters;
  const status = requiredStatus?.required_status_checks?.find((entry) => entry.context === REQUIRED_CHECK);

  if (pr?.state !== "open" || pr?.draft || pr?.merged) {
    blockers.push("Pull request must be open, ready for review, and unmerged.");
  }
  if (pr?.base?.ref !== "main" || !SHA_PATTERN.test(mainSha ?? "") ||
      pr?.base?.sha !== mainSha) {
    blockers.push("Pull request base must match the current protected main SHA.");
  }
  if (!SHA_PATTERN.test(head ?? "")) {
    blockers.push("Pull request head is not an exact 40-character commit SHA.");
  }
  if (pr?.mergeable === false) blockers.push("Pull request is not mergeable.");

  if (ruleset?.enforcement !== "active" ||
      !ruleset?.conditions?.ref_name?.include?.includes("~DEFAULT_BRANCH") ||
      (ruleset?.bypass_actors ?? []).length !== 0) {
    blockers.push("An active, non-bypassable default-branch ruleset is required.");
  }
  if (!requiredReview ||
      requiredReview.required_approving_review_count < 1 ||
      !Array.isArray(requiredReview.allowed_merge_methods) ||
      requiredReview.allowed_merge_methods.length !== 1 ||
      requiredReview.allowed_merge_methods[0] !== "squash") {
    blockers.push("Protected main must enforce at least one independent approval and squash-only merges.");
  }
  if (requiredStatus?.strict_required_status_checks_policy !== true ||
      !status || !Number.isSafeInteger(status.integration_id)) {
    blockers.push("Protected main must enforce the exact required Workspace check with a trusted integration.");
  }
  const passed = (checkRuns ?? []).some((run) =>
    run.name === REQUIRED_CHECK &&
    run.status === "completed" &&
    run.conclusion === "success" &&
    run.head_sha === head &&
    run.app?.id === status?.integration_id
  );
  if (!passed) blockers.push("The exact current PR head has no successful trusted Workspace release check.");

  const reviewByAuthor = new Map();
  for (const review of [...(reviews ?? [])].sort((a, b) =>
    (a.submitted_at ?? "").localeCompare(b.submitted_at ?? ""))) {
    if (review.user?.login) reviewByAuthor.set(review.user.login.toLowerCase(), review);
  }
  const author = pr?.user?.login?.toLowerCase();
  const approved = [...reviewByAuthor.entries()].filter(([reviewer, review]) =>
    reviewer !== author && review.user?.type === "User" &&
    !review.user?.login?.toLowerCase().endsWith("[bot]") &&
    review.state === "APPROVED" && review.commit_id === head
  );
  if (approved.length < 1) {
    blockers.push("An independent reviewer must APPROVE the exact current head (comments or stale approvals do not qualify).");
  }
  return { safe: blockers.length === 0, blockers, head: SHA_PATTERN.test(head ?? "") ? head : null };
}

async function fetchGitHubJson(url, token) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`GitHub read-only preflight failed (HTTP ${response.status})`);
  return response.json();
}

async function main() {
  const repo = process.env.GITHUB_REPOSITORY ?? "gokulggovardhan/lumeo";
  const prNumber = Number(process.env.LUMEO_PR_NUMBER);
  const token = process.env.GITHUB_TOKEN;
  if (!/^[-A-Za-z0-9_.]+\/[-A-Za-z0-9_.]+$/.test(repo) ||
      !Number.isSafeInteger(prNumber) || prNumber <= 0 || !token) {
    throw new Error("Set GITHUB_REPOSITORY, LUMEO_PR_NUMBER and read-only GITHUB_TOKEN for Phase 14 preflight.");
  }
  const api = `https://api.github.com/repos/${repo}`;
  const [pr, mainBranch, reviewEvents, rulesets] = await Promise.all([
    fetchGitHubJson(`${api}/pulls/${prNumber}`, token),
    fetchGitHubJson(`${api}/branches/main`, token),
    fetchGitHubJson(`${api}/pulls/${prNumber}/reviews?per_page=100`, token),
    fetchGitHubJson(`${api}/rulesets?includes_parents=true`, token),
  ]);
  // A large review history requires complete pagination to avoid falsely
  // regarding an incomplete partial history as authoritative.
  if (reviewEvents.length >= 100) throw new Error("More than 99 reviews: paginate before evaluating independent approval.");
  if (!SHA_PATTERN.test(pr.head?.sha ?? "")) throw new Error("PR head SHA is invalid.");
  const policy = rulesets.find((entry) =>
    entry.name === "Protect main" && entry.enforcement === "active");
  if (!policy) throw new Error("Active Protect main ruleset not found.");
  const ruleset = await fetchGitHubJson(`${api}/rulesets/${policy.id}`, token);
  const checkRuns = await fetchGitHubJson(
    `${api}/commits/${pr.head.sha}/check-runs?per_page=100`, token);
  if (checkRuns.total_count > checkRuns.check_runs.length) {
    throw new Error("Required check history incomplete; fail closed.");
  }
  const result = assessProtectedMergeReadiness({
    pr, mainSha: mainBranch.commit.sha,
    reviews: reviewEvents, checkRuns: checkRuns.check_runs, ruleset,
  });
  if (!result.safe) {
    for (const reason of result.blockers) console.error(`BLOCKED: ${reason}`);
    throw new Error("Phase 14 protected merge preflight failed. No merge was attempted.");
  }
  console.log(`READY: human-approved squash-only PR #${prNumber}, exact head ${result.head}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Protected merge preflight failed.");
    process.exitCode = 1;
  });
}
