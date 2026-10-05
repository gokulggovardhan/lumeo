import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { promises as fs } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const lhciConfig = require("../.lighthouserc.cjs");
const baseConfig = lhciConfig.ci.collect;
const assertions = lhciConfig.ci.assert.assertions;
const smokeMode = process.env.LIGHTHOUSE_COLLECTOR_SMOKE === "1";
const baseUrlOverride = process.env.LIGHTHOUSE_BASE_URL?.replace(/\/$/, "") || null;
const chromeFlags = process.env.LIGHTHOUSE_CHROME_FLAGS?.trim() || "";
const configuredRoutes = smokeMode ? [baseConfig.url[0]] : baseConfig.url;
const routes = configuredRoutes.map((configuredUrl) => {
  if (!baseUrlOverride) return configuredUrl;
  const url = new URL(configuredUrl);
  return baseUrlOverride + url.pathname + url.search;
});
const runsPerRoute = baseConfig.numberOfRuns;
const chromePath = process.env.CHROME_PATH || undefined;
const reportDir = path.resolve(".lighthouseci");
const workDir = path.resolve(".lighthouseci-work");
const configPath = path.resolve(".lighthouse-sample-config.mjs");
const lighthouseCli = path.resolve(
  "node_modules",
  "lighthouse",
  "cli",
  "index.js",
);
const maxRuntimeAttemptsPerRoute = Math.max(runsPerRoute * 3, runsPerRoute + 2);
const expectedLighthouseVersion = "13.5.0";

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
      const value = chunk.toString();
      stdout += value;
      process.stdout.write(value);
    });
    child.stderr.on("data", (chunk) => {
      const value = chunk.toString();
      stderr += value;
      process.stderr.write(value);
    });
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

async function readLhr(filePath) {
  try {
    const value = JSON.parse(await fs.readFile(filePath, "utf8"));
    if (value && typeof value === "object" && value.categories && value.audits) {
      return value;
    }
  } catch {
    // A runtime failure may exit before producing a report.
  }
  return null;
}

async function writeConfig() {
  const config = {
    extends: "lighthouse:default",
    settings: {
      ...baseConfig.settings,
      onlyCategories: baseConfig.settings.onlyCategories,
    },
  };
  await fs.writeFile(
    configPath,
    "export default " + JSON.stringify(config, null, 2) + ";\n",
  );
}

async function collectSample(url, routeIndex, sampleIndex, attemptIndex) {
  const attemptPath = path.join(
    workDir,
    "route-" + (routeIndex + 1) + "-attempt-" + attemptIndex + ".json",
  );
  await fs.rm(attemptPath, { force: true });

  const args = [
    url,
    "--config-path=" + configPath,
    "--output=json",
    "--output-path=" + attemptPath,
    "--quiet",
  ];
  if (chromePath) args.push("--chrome-path=" + chromePath);
  if (chromeFlags) args.push("--chrome-flags=" + chromeFlags);

  const result = await run(process.execPath, [lighthouseCli, ...args]);
  const lhr = await readLhr(attemptPath);
  const combined = result.stdout + "\n" + result.stderr;

  if (lhr?.runtimeError) {
    throw new Error(
      (lhr.runtimeError.code ?? "LIGHTHOUSE_RUNTIME") +
        ": " +
        (lhr.runtimeError.message ?? "Lighthouse runtime error"),
    );
  }
  if (!lhr) {
    throw new Error(
      result.code === 0
        ? "Lighthouse CLI completed without a JSON report."
        : combined || "Lighthouse CLI exited with code " + result.code,
    );
  }
  if (lhr.lighthouseVersion !== expectedLighthouseVersion) {
    throw new Error(
      "Unexpected Lighthouse runtime " +
        String(lhr.lighthouseVersion ?? "unknown") +
        "; expected " +
        expectedLighthouseVersion +
        ".",
    );
  }
  if (result.code !== 0) {
    throw new Error(combined || "Lighthouse CLI exited with code " + result.code);
  }

  const reportPath = path.join(
    reportDir,
    "route-" + (routeIndex + 1) + "-sample-" + sampleIndex + ".json",
  );
  await fs.copyFile(attemptPath, reportPath);

  return {
    sample: sampleIndex,
    finalUrl: lhr.finalDisplayedUrl ?? lhr.finalUrl ?? url,
    lighthouseVersion: lhr.lighthouseVersion,
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

async function verifyCollectorEnvironment() {
  if (!smokeMode) return;

  const controlUrl = "https://example.com/";
  console.log(
    "Verifying Lighthouse collector environment against control page " +
      controlUrl,
  );

  try {
    const control = await collectSample(controlUrl, 99, 1, 1);
    console.log(
      "PASS Lighthouse environment control: " +
        controlUrl +
        " painted with Lighthouse " +
        control.lighthouseVersion +
        ".",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isRuntimeFailure(message)) {
      throw new Error(
        "LIGHTHOUSE_ENVIRONMENT_FAILURE: control page could not paint: " +
          message,
      );
    }
    throw error;
  }
}

async function main() {
  await fs.rm(reportDir, { recursive: true, force: true });
  await fs.rm(workDir, { recursive: true, force: true });
  await fs.rm(configPath, { force: true });
  await fs.mkdir(reportDir, { recursive: true });
  await fs.mkdir(workDir, { recursive: true });
  await writeConfig();
  await verifyCollectorEnvironment();

  const routeReports = [];
  const failures = [];

  for (const [routeIndex, url] of routes.entries()) {
    const samples = [];
    const runtimeFailures = [];
    console.log(
      "Measuring " +
        url +
        " until " +
        runsPerRoute +
        " valid isolated Lighthouse " +
        expectedLighthouseVersion +
        " sample(s) are collected (maximum " +
        maxRuntimeAttemptsPerRoute +
        " attempts).",
    );

    for (
      let attemptIndex = 1;
      attemptIndex <= maxRuntimeAttemptsPerRoute && samples.length < runsPerRoute;
      attemptIndex += 1
    ) {
      const sampleIndex = samples.length + 1;
      try {
        samples.push(
          await collectSample(url, routeIndex, sampleIndex, attemptIndex),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!isRuntimeFailure(message)) throw error;
        runtimeFailures.push({ attempt: attemptIndex, message });
        console.warn(
          "Discarding transient Lighthouse runtime-invalid attempt " +
            attemptIndex +
            "/" +
            maxRuntimeAttemptsPerRoute +
            " for " +
            url +
            ": " +
            message,
        );
      }
    }

    if (samples.length !== runsPerRoute) {
      throw new Error(
        "Could not collect " +
          runsPerRoute +
          " valid Lighthouse samples for " +
          url +
          " after " +
          maxRuntimeAttemptsPerRoute +
          " attempts. Runtime failures: " +
          runtimeFailures.length,
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
        failures.push(url + ": missing numeric samples for " + assertionName);
        continue;
      }
      medians[assertionName] = median(values);
    }

    for (const [assertionName, [, threshold]] of Object.entries(assertions)) {
        const value = medians[assertionName];
        if (typeof value !== "number") continue;
        if ("minScore" in threshold && value < threshold.minScore) {
          failures.push(
            url +
              ": median " +
              assertionName +
              " " +
              value.toFixed(3) +
              " < " +
              threshold.minScore,
          );
        }
        if ("maxNumericValue" in threshold && value > threshold.maxNumericValue) {
          failures.push(
            url +
              ": median " +
              assertionName +
              " " +
              Math.round(value) +
              " > " +
              threshold.maxNumericValue,
          );
        }
      }

    routeReports.push({ url, samples, medians, runtimeFailures });
    console.log("PASS collection " + url + ": " + JSON.stringify(medians));
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    mode: smokeMode ? "collector-smoke" : "production-budget",
    lighthouseVersion: expectedLighthouseVersion,
    runsPerRoute,
    routes: routeReports,
    assertions,
    failures,
  };
  await fs.writeFile(
    path.join(reportDir, "summary.json"),
    JSON.stringify(summary, null, 2) + "\n",
  );

  await fs.rm(workDir, { recursive: true, force: true });
  await fs.rm(configPath, { force: true });

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error("LIGHTHOUSE BUDGET FAIL: " + failure);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    "PASS mobile Lighthouse budgets: " +
      routeReports.length +
      " routes x " +
      runsPerRoute +
      " isolated samples" +
      (smokeMode ? " on PR-local homepage." : "."),
  );
}

main().catch(async (error) => {
  await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  await fs.rm(configPath, { force: true }).catch(() => {});
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
