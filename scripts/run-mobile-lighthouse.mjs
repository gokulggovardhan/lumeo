import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { promises as fs } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const lhciConfig = require("../.lighthouserc.cjs");
const baseConfig = lhciConfig.ci.collect;
const assertions = lhciConfig.ci.assert.assertions;
const routes = baseConfig.url;
const runsPerRoute = baseConfig.numberOfRuns;
const chromePath = process.env.CHROME_PATH || undefined;
const liveDir = path.resolve(".lighthouseci");
const finalDir = path.resolve(".lighthouseci-final");
const tempConfigPath = path.resolve(".lighthouseci-sample.cjs");
const maxRuntimeAttemptsPerRoute = Math.max(runsPerRoute * 3, runsPerRoute + 2);

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function isRuntimeFailure(value) {
  const text = String(value ?? "");
  return /NO_FCP|PROTOCOL_TIMEOUT|PAGE_HUNG|TARGET_CRASHED|Chrome.*(?:disconnected|crashed)|Unable to connect to Chrome/i.test(text);
}

async function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

async function findLhr() {
  let entries = [];
  try {
    entries = await fs.readdir(liveDir);
  } catch {
    return null;
  }

  for (const name of entries) {
    if (!name.endsWith(".json") || name === "manifest.json") continue;
    const full = path.join(liveDir, name);
    try {
      const value = JSON.parse(await fs.readFile(full, "utf8"));
      if (value && typeof value === "object" && value.categories && value.audits) {
        return value;
      }
    } catch {
      // Keep looking for the Lighthouse result.
    }
  }
  return null;
}

async function collectSample(url, routeIndex, sampleIndex) {
  await fs.rm(liveDir, { recursive: true, force: true });

  const sampleConfig = {
    ci: {
      collect: {
        url: [url],
        numberOfRuns: 1,
        settings: {
          ...baseConfig.settings,
          chromeFlags: "--no-sandbox --disable-dev-shm-usage",
        },
      },
    },
  };

  await fs.writeFile(
    tempConfigPath,
    "module.exports = " + JSON.stringify(sampleConfig, null, 2) + ";\n",
  );

  const args = [
    "--yes",
    "@lhci/cli@0.15.1",
    "collect",
    `--config=${tempConfigPath}`,
  ];
  if (chromePath) args.push(`--chromePath=${chromePath}`);

  const result = await run("npx", args);
  const lhr = await findLhr();
  const combined = `${result.stdout}\n${result.stderr}`;

  if (lhr?.runtimeError) {
    throw new Error(
      `${lhr.runtimeError.code ?? "LIGHTHOUSE_RUNTIME"}: ${lhr.runtimeError.message ?? "Lighthouse runtime error"}`,
    );
  }
  if (!lhr) {
    throw new Error(
      result.code === 0
        ? "LHCI collect completed without a Lighthouse result."
        : combined || `LHCI collect exited with code ${result.code}`,
    );
  }
  if (result.code !== 0) {
    throw new Error(combined || `LHCI collect exited with code ${result.code}`);
  }

  const reportPath = path.join(
    finalDir,
    `route-${routeIndex + 1}-sample-${sampleIndex}.json`,
  );
  await fs.writeFile(reportPath, JSON.stringify(lhr, null, 2) + "\n");

  return {
    sample: sampleIndex,
    finalUrl: lhr.finalDisplayedUrl ?? lhr.finalUrl ?? url,
    categories: Object.fromEntries(
      baseConfig.settings.onlyCategories.map((name) => [
        name,
        lhr.categories[name]?.score ?? null,
      ]),
    ),
    metrics: {
      "largest-contentful-paint":
        lhr.audits["largest-contentful-paint"]?.numericValue ?? null,
      "cumulative-layout-shift":
        lhr.audits["cumulative-layout-shift"]?.numericValue ?? null,
      "total-blocking-time":
        lhr.audits["total-blocking-time"]?.numericValue ?? null,
    },
  };
}

async function main() {
  await fs.rm(liveDir, { recursive: true, force: true });
  await fs.rm(finalDir, { recursive: true, force: true });
  await fs.rm(tempConfigPath, { force: true });
  await fs.mkdir(finalDir, { recursive: true });

  const routeReports = [];
  const failures = [];

  for (const [routeIndex, url] of routes.entries()) {
    const samples = [];
    const runtimeFailures = [];
    console.log(
      `Measuring ${url} until ${runsPerRoute} valid isolated LHCI samples are collected (maximum ${maxRuntimeAttemptsPerRoute} attempts).`,
    );

    for (
      let attemptIndex = 1;
      attemptIndex <= maxRuntimeAttemptsPerRoute && samples.length < runsPerRoute;
      attemptIndex += 1
    ) {
      const sampleIndex = samples.length + 1;
      try {
        samples.push(await collectSample(url, routeIndex, sampleIndex));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!isRuntimeFailure(message)) throw error;
        runtimeFailures.push({ attempt: attemptIndex, message });
        console.warn(
          `Discarding transient LHCI runtime-invalid attempt ${attemptIndex}/${maxRuntimeAttemptsPerRoute} for ${url}: ${message}`,
        );
      }
    }

    if (samples.length !== runsPerRoute) {
      throw new Error(
        `Could not collect ${runsPerRoute} valid LHCI samples for ${url} after ${maxRuntimeAttemptsPerRoute} attempts. Runtime failures: ${runtimeFailures.length}`,
      );
    }

    const medians = {};
    for (const assertionName of Object.keys(assertions)) {
      const values = samples
        .map((sample) => {
          if (assertionName.startsWith("categories:")) {
            return sample.categories[assertionName.slice("categories:".length)];
          }
          return sample.metrics[assertionName];
        })
        .filter((value) => typeof value === "number" && Number.isFinite(value));

      if (values.length !== runsPerRoute) {
        failures.push(`${url}: missing numeric samples for ${assertionName}`);
        continue;
      }
      medians[assertionName] = median(values);
    }

    for (const [assertionName, [, threshold]] of Object.entries(assertions)) {
      const value = medians[assertionName];
      if (typeof value !== "number") continue;
      if ("minScore" in threshold && value < threshold.minScore) {
        failures.push(
          `${url}: median ${assertionName} ${value.toFixed(3)} < ${threshold.minScore}`,
        );
      }
      if ("maxNumericValue" in threshold && value > threshold.maxNumericValue) {
        failures.push(
          `${url}: median ${assertionName} ${Math.round(value)} > ${threshold.maxNumericValue}`,
        );
      }
    }

    routeReports.push({ url, samples, medians, runtimeFailures });
    console.log(`PASS collection ${url}: ${JSON.stringify(medians)}`);
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    runsPerRoute,
    routes: routeReports,
    assertions,
    failures,
  };
  await fs.writeFile(
    path.join(finalDir, "summary.json"),
    JSON.stringify(summary, null, 2) + "\n",
  );

  await fs.rm(liveDir, { recursive: true, force: true });
  await fs.rename(finalDir, liveDir);
  await fs.rm(tempConfigPath, { force: true });

  if (failures.length > 0) {
    for (const failure of failures) console.error(`LIGHTHOUSE BUDGET FAIL: ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `PASS mobile Lighthouse budgets: ${routeReports.length} routes x ${runsPerRoute} isolated LHCI samples.`,
  );
}

main().catch(async (error) => {
  try {
    if (await fs.stat(finalDir).catch(() => null)) {
      await fs.rm(liveDir, { recursive: true, force: true });
      await fs.rename(finalDir, liveDir);
    }
    await fs.rm(tempConfigPath, { force: true });
  } catch {}
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
