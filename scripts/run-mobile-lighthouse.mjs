import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";
import { createRequire } from "node:module";
import { promises as fs } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const lhciConfig = require("../.lighthouserc.cjs");
const baseConfig = lhciConfig.ci.collect;
const assertions = lhciConfig.ci.assert.assertions;
const reportDir = path.resolve(".lighthouseci");
const routes = baseConfig.url;
const runsPerRoute = baseConfig.numberOfRuns;
const chromePath = process.env.CHROME_PATH || undefined;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function assertionValue(name, lhr) {
  if (name.startsWith("categories:")) {
    const category = name.slice("categories:".length);
    return lhr.categories[category]?.score ?? null;
  }
  return lhr.audits[name]?.numericValue ?? null;
}

function isRuntimeFailure(error) {
  const text = String(
    error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ""}` : error,
  );
  return /NO_FCP|PROTOCOL_TIMEOUT|PAGE_HUNG|TARGET_CRASHED|Chrome.*(?:disconnected|crashed)/i.test(text);
}

async function runSample(url, routeIndex, sampleIndex) {
  let lastError = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const chrome = await chromeLauncher.launch({
      chromePath,
      chromeFlags: [
        "--no-sandbox",
        "--disable-gpu",
        "--start-maximized",
        "--disable-dev-shm-usage",
        "--disable-background-timer-throttling",
        "--disable-renderer-backgrounding",
        "--disable-backgrounding-occluded-windows",
      ],
    });

    try {
      const result = await lighthouse(
        url,
        {
          port: chrome.port,
          output: "json",
          logLevel: "error",
        },
        {
          extends: "lighthouse:default",
          settings: {
            ...baseConfig.settings,
            onlyCategories: baseConfig.settings.onlyCategories,
          },
        },
      );

      if (!result?.lhr) {
        throw new Error("Lighthouse returned no report.");
      }
      if (result.lhr.runtimeError) {
        const runtime = new Error(
          `${result.lhr.runtimeError.code ?? "LIGHTHOUSE_RUNTIME"}: ${result.lhr.runtimeError.message ?? "Lighthouse runtime error"}`,
        );
        lastError = runtime;
        if (attempt < 2 && isRuntimeFailure(runtime)) {
          console.warn(
            `Transient Lighthouse runtime failure for ${url} sample ${sampleIndex}, retrying with a fresh Chrome instance: ${runtime.message}`,
          );
          continue;
        }
        throw runtime;
      }

      const reportPath = path.join(
        reportDir,
        `route-${routeIndex + 1}-sample-${sampleIndex}.json`,
      );
      await fs.writeFile(reportPath, JSON.stringify(result.lhr, null, 2) + "\n");

      return {
        sample: sampleIndex,
        finalUrl: result.lhr.finalDisplayedUrl ?? result.lhr.finalUrl ?? url,
        categories: Object.fromEntries(
          baseConfig.settings.onlyCategories.map((name) => [
            name,
            result.lhr.categories[name]?.score ?? null,
          ]),
        ),
        metrics: {
          "largest-contentful-paint":
            result.lhr.audits["largest-contentful-paint"]?.numericValue ?? null,
          "cumulative-layout-shift":
            result.lhr.audits["cumulative-layout-shift"]?.numericValue ?? null,
          "total-blocking-time":
            result.lhr.audits["total-blocking-time"]?.numericValue ?? null,
        },
      };
    } catch (error) {
      lastError = error;
      if (attempt < 2 && isRuntimeFailure(error)) {
        console.warn(
          `Transient Lighthouse browser/runtime failure for ${url} sample ${sampleIndex}; retrying once with a fresh Chrome instance.`,
        );
        continue;
      }
      throw error;
    } finally {
      await Promise.resolve(chrome.kill()).catch(() => {});
    }
  }

  throw lastError ?? new Error(`Lighthouse failed for ${url}`);
}

async function main() {
  await fs.rm(reportDir, { recursive: true, force: true });
  await fs.mkdir(reportDir, { recursive: true });

  const routeReports = [];
  const failures = [];

  for (const [routeIndex, url] of routes.entries()) {
    const samples = [];
    console.log(`Measuring ${url} with ${runsPerRoute} independent mobile Lighthouse samples.`);

    for (let sampleIndex = 1; sampleIndex <= runsPerRoute; sampleIndex += 1) {
      samples.push(await runSample(url, routeIndex, sampleIndex));
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

    routeReports.push({ url, samples, medians });
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
    path.join(reportDir, "summary.json"),
    JSON.stringify(summary, null, 2) + "\n",
  );

  if (failures.length > 0) {
    for (const failure of failures) console.error(`LIGHTHOUSE BUDGET FAIL: ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `PASS mobile Lighthouse budgets: ${routeReports.length} routes x ${runsPerRoute} independent samples.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
