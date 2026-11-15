// Phase 16 final live release evidence guard. READ ONLY.
// Reports the first missing proof; does not merge, approve, deploy, change
// policy, mark phases complete, or store credentials or private PDF content.
import { pathToFileURL } from "node:url";

const VALID_SHA = /^[0-9a-f]{40}$/i;
const PHASE_PR_MAP = Object.fromEntries(
  Array.from({ length: 9 }, (_, i) => [i + 7, i + 712])
);

export function parseLedgerPhases(body) {
  const states = new Map();
  for (const line of (body ?? "").split(/\r?\n/)) {
    const match = line.match(/^\|\s*(\d+)\s*\|[^|]+\|\s*([^|]+)\|/);
    if (match) states.set(Number(match[1]), match[2].trim());
  }
  return states;
}

export function evaluateFinalInScopeRelease({
  expectedSha, mainSha, production, finalProduction,
  deployment, phaseStates, phasePulls, checks, productionCacheControl,
}) {
  const blocked = [];
  if (!VALID_SHA.test(expectedSha ?? "") || mainSha !== expectedSha) {
    blocked.push("Expected release SHA must equal exact protected main.");
  }
  for (let phase = 0; phase <= 15; phase++) {
    if (phaseStates?.get(phase) !== "COMPLETED") {
      blocked.push(`Phase ${phase} is not independently release-certified in the authoritative ledger.`);
    }
  }
  if (!["IN PROGRESS", "COMPLETED"].includes(phaseStates?.get(16))) {
    blocked.push("Phase 16 final verification has not been entered in the release ledger.");
  }
  for (const [phase, number] of Object.entries(PHASE_PR_MAP)) {
    const pr = phasePulls?.get(Number(phase));
    if (pr?.number !== number || pr?.merged !== true ||
        !VALID_SHA.test(pr?.merge_commit_sha ?? "")) {
      blocked.push(`Phase ${phase} PR #${number} lacks an actual protected merge commit.`);
    }
  }
  for (const checkName of [
    "Validate Lumeo PDF Workspace",
    "Certify exact lumeo.in Workspace production",
  ]) {
    if (!(checks ?? []).some(c =>
      c.name === checkName && c.head_sha === expectedSha &&
      c.status === "completed" && c.conclusion === "success"
    )) blocked.push(`Missing successful exact-main-SHA check: ${checkName}.`);
  }
  if (!production || production.commit !== expectedSha ||
      production.environment !== "production" ||
      !finalProduction || finalProduction.commit !== expectedSha ||
      finalProduction.environment !== "production") {
    blocked.push("Live production build identity is not stable at the expected main SHA.");
  }
  if (!/(?:^|,)\s*no-store(?:\s|,|$)/i.test(productionCacheControl ?? "")) {
    blocked.push("Production build-info must have no-store caching.");
  }
  const rollout = deployment?.versions ?? [];
  if (rollout.length !== 1 || Number(rollout[0]?.percentage) !== 100 ||
      !deployment?.id) {
    blocked.push("Cloudflare lumeo-app does not show a single 100% traffic deployment.");
  }
  return { pass: blocked.length === 0, blocked };
}

async function readJson(url, bearer) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${bearer}`,
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Read-only evidence request failed (HTTP ${response.status})`);
  return response.json();
}

async function publicBuildInfo() {
  const response = await fetch("https://lumeo.in/api/build-info", {
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Production build-info HTTP ${response.status}`);
  return { value: await response.json(), cache: response.headers.get("cache-control") ?? "" };
}

async function main() {
  const githubToken = process.env.GITHUB_TOKEN;
  const cfToken = process.env.CLOUDFLARE_API_TOKEN;
  const cfAccount = process.env.CLOUDFLARE_ACCOUNT_ID;
  const expectedSha = process.env.EXPECTED_SHA;
  const repo = process.env.GITHUB_REPOSITORY ?? "gokulggovardhan/lumeo";
  if (!githubToken || !cfToken || !/^[0-9a-f]{32}$/i.test(cfAccount ?? "") ||
      !VALID_SHA.test(expectedSha ?? "") ||
      !/^[-A-Za-z0-9_.]+\/[-A-Za-z0-9_.]+$/.test(repo)) {
    throw new Error("Set authorized read-only GITHUB_TOKEN, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID and exact EXPECTED_SHA.");
  }
  const api = `https://api.github.com/repos/${repo}`;
  const [mainBranch, issue, checkRuns, initialBuild, cfResponse, ...pulls] = await Promise.all([
    readJson(`${api}/branches/main`, githubToken),
    readJson(`${api}/issues/698`, githubToken),
    readJson(`${api}/commits/${expectedSha}/check-runs?per_page=100`, githubToken),
    publicBuildInfo(),
    readJson(`https://api.cloudflare.com/client/v4/accounts/${cfAccount}/workers/scripts/lumeo-app/deployments?per_page=1`, cfToken),
    ...Object.values(PHASE_PR_MAP).map(number => readJson(`${api}/pulls/${number}`, githubToken)),
  ]);
  if (!cfResponse.success) throw new Error("Cloudflare deployment metadata was not verified.");
  if (checkRuns.total_count > checkRuns.check_runs.length) {
    throw new Error("GitHub checks are incomplete; paginate before final certification.");
  }
  const finalBuild = await publicBuildInfo();
  const map = new Map(pulls.map((pr, i) => [i + 7, pr]));
  const checked = evaluateFinalInScopeRelease({
    expectedSha, mainSha: mainBranch.commit.sha,
    phaseStates: parseLedgerPhases(issue.body), phasePulls: map,
    checks: checkRuns.check_runs,
    production: initialBuild.value, finalProduction: finalBuild.value,
    productionCacheControl: initialBuild.cache,
    deployment: cfResponse.result?.deployments?.[0],
  });
  if (!checked.pass) {
    for (const reason of checked.blocked) console.error(`BLOCKED: ${reason}`);
    throw new Error("Phase 16 release certification failed. Nothing was marked completed.");
  }
  console.log(`PASS: all prerequisite phases, exact merged main ${expectedSha}, full live certification, Cloudflare 100% rollout.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : "Phase 16 release validation failed.");
    process.exitCode = 1;
  });
}
