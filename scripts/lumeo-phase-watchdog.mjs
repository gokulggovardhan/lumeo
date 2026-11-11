// GitHub-only, zero-new-service operations watchdog for Lumeo issue #698.
// Never edits production, merges PRs, advances a phase or certifies an outcome.
// Only a proven transient setup job may be retried, once per workflow run.
import { createHash } from "node:crypto";
import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const REPO = "gokulggovardhan/lumeo";
const LEDGER_ISSUE = 698;
const MARKER = "<!-- lumeo-phase-watchdog:v1 -->";
const API = "https://api.github.com";
const STALL_MS = 180 * 60_000;
const MAX_AUTO_RETRIES = 1;

export function parseLedger(body) {
  const phases = new Map();
  for (const line of body.split("\n")) {
    const match = /^\|\s*(\d{1,2})\s*\|[^|]*\|\s*(COMPLETED|IN PROGRESS|BLOCKED|NOT STARTED|PENDING)\s*\|/i.exec(line);
    if (!match) continue;
    phases.set(Number(match[1]), match[2].toUpperCase());
  }
  if (phases.size !== 17 || Array.from({ length: 17 }, (_, i) => i).some((i) => !phases.has(i))) {
    throw new Error("Issue #698 does not have a complete, unambiguous Phase 0–16 status table.");
  }
  if (phases.get(0) !== "COMPLETED" || phases.get(1) !== "COMPLETED") {
    throw new Error("Certified Phase 0–1 baselines changed; watchdog will not act.");
  }
  const activePhase = Array.from({ length: 17 }, (_, i) => i).find((i) => phases.get(i) !== "COMPLETED");
  return { phases, activePhase: activePhase ?? null, allComplete: activePhase === undefined };
}

export function isStalled(run, now = Date.now()) {
  if (!run || !["queued", "in_progress", "waiting", "requested", "pending"].includes(run.status)) return false;
  const started = Date.parse(run.run_started_at ?? run.created_at ?? "");
  return Number.isFinite(started) && now - started > STALL_MS;
}

export function phasePrMatches(pr, phase) {
  if (phase === null || !pr || pr.base?.ref !== "main" || pr.head?.repo?.full_name !== REPO) return false;
  const pattern = new RegExp("\\bphase[\\s_-]*0?" + phase + "\\b", "i");
  return pattern.test(pr.title ?? "") || pattern.test(pr.head?.ref ?? "");
}

export function eligibleRetry({ run, job, pr, log }) {
  if (!pr || pr.draft || pr.state !== "open" || pr.head?.repo?.full_name !== REPO) return false;
  if (!run || run.event !== "pull_request" || run.name !== "Lumeo CI" ||
      run.head_sha !== pr.head.sha || run.status !== "completed" ||
      run.conclusion !== "failure" || run.run_attempt !== MAX_AUTO_RETRIES) return false;
  if (!job || job.status !== "completed" || job.conclusion !== "failure") return false;
  // A failed browser test, assertion, lint, security or application step is
  // NEVER automatically retried, even if its log contains a network warning.
  const failedSteps = (job.steps ?? []).filter((step) => step.conclusion === "failure");
  if (failedSteps.length !== 1) return false;
  if (!/^(?:Checkout repository|Set up Node\.js|Install exact dependencies|Install Chromium, WebKit and Firefox|Install Playwright browsers)$/.test(failedSteps[0].name)) return false;
  // Require a concrete transient setup failure. No generic "timeout" matching.
  return /(?:npm ERR! code (?:ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND)|(?:getaddrinfo )?EAI_AGAIN|Temporary failure resolving|Temporary failure in name resolution|Connection reset by peer|TLS connection reset|Failed to fetch.*(?:502|503|504)|(?:502|503|504) (?:Bad Gateway|Service Unavailable|Gateway Timeout)|apt(?:-get)?:?.*(?:Hash Sum mismatch|Failed to fetch))/i.test(log);
}

function compactRun(run) {
  return run ? {
    id: run.id,
    name: run.name,
    status: run.status,
    conclusion: run.conclusion,
    attempt: run.run_attempt,
    stalled: isStalled(run),
  } : null;
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GitHub Actions token not available.");
  if (process.env.GITHUB_REPOSITORY !== REPO) throw new Error("Wrong repository context.");
  const dryRun = process.env.WATCHDOG_DRY_RUN === "true";
  const checked = new Date().toISOString();

  async function gh(path, { method = "GET", body, raw = false } = {}) {
    const response = await fetch(API + path, {
      method,
      headers: {
        Authorization: "Bearer " + token,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) throw new Error("GitHub " + method + " " + path + ": HTTP " + response.status);
    if (raw) return response.text();
    if (response.status === 204) return null;
    return response.json();
  }

  const ledger = await gh("/repos/" + REPO + "/issues/" + LEDGER_ISSUE);
  const { activePhase, allComplete, phases } = parseLedger(ledger.body ?? "");
  const mainRef = await gh("/repos/" + REPO + "/git/ref/heads/main");
  const mainSha = mainRef.object.sha;
  const mainRuns = await gh("/repos/" + REPO + "/actions/runs?head_sha=" + mainSha + "&per_page=100");
  const watchNames = [
    "Lumeo CI", "PDF Workspace Production Certification",
    "Lumeo Production Health", "Mobile Lighthouse", "Route JavaScript Budget",
  ];
  const mainWorkflows = watchNames.map((name) => {
    const run = (mainRuns.workflow_runs ?? []).find((item) => item.name === name);
    return compactRun(run);
  }).filter(Boolean);

  const checks = await gh("/repos/" + REPO + "/commits/" + mainSha + "/check-runs?per_page=100");
  const required = (checks.check_runs ?? [])
    .filter((item) => item.name === "Validate Lumeo PDF Workspace")
    .sort((a, b) => Date.parse(b.started_at ?? "") - Date.parse(a.started_at ?? ""))[0];
  const requiredCheck = required
    ? { status: required.status, conclusion: required.conclusion }
    : { status: "missing", conclusion: null };

  let production = { commit: null, environment: null, exactSha: false, reachable: false };
  try {
    const response = await fetch("https://lumeo.in/api/build-info", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error("production build-info HTTP " + response.status);
    const info = await response.json();
    production = {
      commit: typeof info.commit === "string" ? info.commit : null,
      environment: typeof info.environment === "string" ? info.environment : null,
      exactSha: info.commit === mainSha && info.environment === "production",
      reachable: true,
    };
  } catch {
    // Unreachable production is a reportable blocker, never a reason to deploy.
  }

  const openPrs = await gh("/repos/" + REPO + "/pulls?state=open&per_page=100");
  const activePrs = (openPrs ?? []).filter((pr) => phasePrMatches(pr, activePhase));
  const trackedPrs = [];
  const openPrChecks = [];
  const actions = [];
  const anomalies = [];
  // The watchdog reports ALL open PRs (including stacked/fork PRs), but
  // may recover jobs only on the active phase's own implementation PR.
  for (const pr of (openPrs ?? []).slice(0, 30)) {
    // Fork heads may not exist in the base repository's commit namespace.
    // Their checks are reported as external instead of aborting monitoring.
    let checkState = "external fork";
    if (pr.head?.repo?.full_name === REPO) {
      try {
        const prCheckData = await gh("/repos/" + REPO + "/commits/" + pr.head.sha + "/check-runs?per_page=100");
        const prRequired = (prCheckData.check_runs ?? []).find((entry) => entry.name === "Validate Lumeo PDF Workspace");
        checkState = prRequired?.conclusion ?? prRequired?.status ?? "missing";
      } catch {
        checkState = "unavailable";
        anomalies.push("Open PR #" + pr.number + " checks temporarily unavailable");
      }
    }
    const result = {
      number: pr.number, sha: pr.head.sha, draft: pr.draft,
      requiredCheck: checkState,
      activePhase: phasePrMatches(pr, activePhase),
    };
    openPrChecks.push(result);
    if (["failure", "cancelled", "timed_out"].includes(result.requiredCheck)) {
      anomalies.push("Open PR #" + pr.number + " required validation " + result.requiredCheck);
    }
  }
  const stalledRuns = mainWorkflows.filter((run) => run.stalled);
  if (stalledRuns.length) anomalies.push("Main workflows possibly stalled: " + stalledRuns.map((r) => r.id).join(", "));
  for (const run of mainWorkflows) {
    if (["failure", "cancelled", "timed_out", "action_required"].includes(run.conclusion)) {
      anomalies.push("Main workflow " + run.name + " concluded " + run.conclusion + " (" + run.id + ")");
    }
  }

  for (const pr of activePrs) {
    const found = await gh("/repos/" + REPO + "/actions/runs?head_sha=" + pr.head.sha + "&per_page=30");
    const candidate = (found.workflow_runs ?? []).find((run) => run.name === "Lumeo CI" && run.event === "pull_request");
    trackedPrs.push({ number: pr.number, sha: pr.head.sha, draft: pr.draft, ci: compactRun(candidate) });
    if (!candidate) {
      anomalies.push("Phase PR #" + pr.number + " has no Lumeo CI run.");
      continue;
    }
    if (isStalled(candidate)) anomalies.push("Phase PR #" + pr.number + " CI possibly stalled (" + candidate.id + ")");
    if (["cancelled", "timed_out", "action_required"].includes(candidate.conclusion)) {
      anomalies.push("Phase PR #" + pr.number + " CI concluded " + candidate.conclusion + " (" + candidate.id + ")");
    }
    if (dryRun || actions.length || !eligiblePr(pr, candidate)) continue;
    const jobs = await gh("/repos/" + REPO + "/actions/runs/" + candidate.id + "/jobs?per_page=100");
    // One recovery per watchdog execution, one attempt per CI run.
    for (const job of jobs.jobs ?? []) {
      if (job.conclusion !== "failure") continue;
      const setupFailed = (job.steps ?? []).some((step) =>
        step.conclusion === "failure" &&
        /^(?:Checkout repository|Set up Node\.js|Install exact dependencies|Install Chromium, WebKit and Firefox|Install Playwright browsers)$/.test(step.name));
      if (!setupFailed) continue;
      let log = "";
      try { log = await gh("/repos/" + REPO + "/actions/jobs/" + job.id + "/logs", { raw: true }); }
      catch { anomalies.push("Job " + job.id + " log unavailable; no retry."); continue; }
      if (!eligibleRetry({ run: candidate, job, pr, log: log.slice(-1_000_000) })) continue;
      await gh("/repos/" + REPO + "/actions/jobs/" + job.id + "/rerun", { method: "POST" });
      actions.push("Retried verified transient setup job " + job.id + " once on PR #" + pr.number + ", CI run " + candidate.id);
      break;
    }
  }

  function eligiblePr(pr, run) {
    return pr.state === "open" && !pr.draft && pr.head?.repo?.full_name === REPO &&
      run.status === "completed" && run.conclusion === "failure" &&
      run.run_attempt === MAX_AUTO_RETRIES && run.head_sha === pr.head.sha;
  }

  if (!allComplete && activePrs.length === 0) {
    anomalies.push("No matching open implementation PR for Phase " + activePhase + "; no unattended source-code agent is configured.");
  }
  if (!production.reachable) anomalies.push("Production build-info unreachable; manual verification is needed.");
  if (allComplete) actions.push("All 17 phases show COMPLETED in the ledger; no recovery or phase advancement attempted.");
  if (dryRun) actions.push("Dry run: no retries and no issue changes.");

  const snapshot = {
    activePhase, phaseStatus: activePhase === null ? "COMPLETED" : phases.get(activePhase),
    mainSha, requiredCheck, production, mainWorkflows, trackedPrs, openPrChecks, anomalies,
    // A retry is a material state transition, but ordinary checks shouldn't
    // generate a new issue comment every half hour.
    actions: actions.filter((item) => !item.startsWith("Dry run")),
  };
  const fingerprint = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex").slice(0, 20);
  const summary = [
    "### Lumeo 30-minute phase watchdog",
    "Run: " + checked + " (GitHub Actions evidence; monitoring only)",
    "Phase: " + (activePhase === null ? "0–16 COMPLETED in ledger" : activePhase + " — " + phases.get(activePhase)),
    "Main: " + mainSha,
    "Required check: " + requiredCheck.status + "/" + (requiredCheck.conclusion ?? "pending"),
    "Production build-info: " + (production.reachable ? (production.exactSha ? "exact main SHA" : "SHA mismatch or older deployment") : "unreachable"),
    "Open PR required checks: " + (openPrChecks.map((item) => "#" + item.number + "=" + item.requiredCheck + (item.activePhase ? " (active phase)" : "")).join("; ") || "none"),
    "Open active-phase PRs: " + (trackedPrs.map((item) => "#" + item.number + " (" + (item.ci?.conclusion ?? item.ci?.status ?? "no CI") + ")").join(", ") || "none"),
    "Main workflows: " + mainWorkflows.map((r) => r.name + "=" + (r.conclusion ?? r.status)).join("; "),
    "Anomalies: " + (anomalies.join("; ") || "none detected"),
    "Action: " + (actions.join("; ") || "read-only inspection; no authorised retry"),
    "Important: no deployment, merge, code fix, or phase certification is performed by this job.",
  ].join("\n");
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary + "\n");
  if (dryRun) return;

  // One editable evidence comment, updated only when the observed state
  // changes. Never rewrites the owner's canonical phase certification table.
  let existing = null;
  for (let page = 1; page <= 10 && !existing; page += 1) {
    const comments = await gh("/repos/" + REPO + "/issues/" + LEDGER_ISSUE + "/comments?per_page=100&page=" + page);
    existing = comments.find((item) => (item.body ?? "").startsWith(MARKER)) ?? null;
    if (comments.length < 100) break;
  }
  const fingerprintMarker = "<!-- fingerprint:" + fingerprint + " -->";
  if (existing?.body.includes(fingerprintMarker)) return;
  const issueBody = [MARKER, fingerprintMarker, "## Automated phase watchdog — operational observation, NOT certification", "", summary].join("\n");
  if (existing) {
    await gh("/repos/" + REPO + "/issues/comments/" + existing.id, { method: "PATCH", body: { body: issueBody } });
  } else {
    await gh("/repos/" + REPO + "/issues/" + LEDGER_ISSUE + "/comments", { method: "POST", body: { body: issueBody } });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("Watchdog failed safely: " + (error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  });
}
