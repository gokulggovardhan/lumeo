import { chromium } from "@playwright/test";
import { gzipSync } from "node:zlib";
import { promises as fs } from "node:fs";
import path from "node:path";

const BASE_URL = (process.env.LUMEO_ROUTE_JS_BASE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const REPORT_PATH = path.resolve(process.cwd(), "test-results/route-js-budget.json");
const ENFORCE_TRANSFER = process.env.LUMEO_ROUTE_JS_ENFORCE_TRANSFER === "1";
const BASELINE_SHA = "abfe1059256329488eae4d3dc83eaed0ef2037d2";

const routeBudgets = {
  "/": {
    baselineScripts: 40,
    baselineRawBytes: 867_903,
    baselineTransferBytes: 281_114,
    maxScripts: 52,
    maxRawBytes: 975_000,
    maxGzipBytes: 325_000,
    maxTransferBytes: 325_000,
  },
  "/pdf": {
    baselineScripts: 49,
    baselineRawBytes: 914_532,
    baselineTransferBytes: 301_691,
    maxScripts: 56,
    maxRawBytes: 1_025_000,
    maxGzipBytes: 350_000,
    maxTransferBytes: 350_000,
  },
  "/pdf-tools": {
    baselineScripts: 37,
    baselineRawBytes: 880_055,
    baselineTransferBytes: 283_304,
    maxScripts: 43,
    maxRawBytes: 990_000,
    maxGzipBytes: 330_000,
    maxTransferBytes: 330_000,
  },
  "/pdf/edit": {
    baselineScripts: 76,
    baselineRawBytes: 1_742_752,
    baselineTransferBytes: 619_955,
    maxScripts: 88,
    maxRawBytes: 1_950_000,
    maxGzipBytes: 710_000,
    maxTransferBytes: 715_000,
  },
};

const maxSingleRawBytes = 430_000;
const maxSingleGzipBytes = 195_000;
const maxSingleTransferBytes = 195_000;
const minimumRouteObservationMs = 1_500;
const javascriptQuietWindowMs = 1_000;
const maximumRouteObservationMs = 15_000;

function sameOriginStaticJavaScript(url) {
  try {
    const parsed = new URL(url);
    return (
      parsed.origin === new URL(BASE_URL).origin &&
      parsed.pathname.startsWith("/_next/static/") &&
      parsed.pathname.endsWith(".js")
    );
  } catch {
    return false;
  }
}

function isSpeculativeNavigationPrefetch(headers) {
  const purpose = [headers.purpose, headers["sec-purpose"]]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return headers["next-router-prefetch"] === "1" || purpose.includes("prefetch");
}

async function measureRoute(browser, route) {
  const context = await browser.newContext();
  const page = await context.newPage();

  // Step 5 measures JavaScript required by the route itself. Next/router
  // navigation prefetch is future-route work and must not be charged to the
  // current page. Blocking only requests explicitly marked as prefetch keeps
  // delayed current-route imports (for example Edit PDF after first paint)
  // inside the measurement.
  await page.route("**/*", async (routeHandler) => {
    const headers = await routeHandler.request().allHeaders();
    if (isSpeculativeNavigationPrefetch(headers)) {
      await routeHandler.abort("blockedbyclient");
      return;
    }
    await routeHandler.continue();
  });

  const cdp = await context.newCDPSession(page);
  const requestUrls = new Map();
  const encodedTransfer = new Map();
  const scripts = new Map();
  const bodyReads = [];
  let lastJavaScriptActivityAt = Date.now();

  const noteJavaScriptActivity = () => {
    lastJavaScriptActivityAt = Date.now();
  };

  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });

  cdp.on("Network.responseReceived", (event) => {
    const url = event.response?.url;
    if (!url || !sameOriginStaticJavaScript(url)) return;
    requestUrls.set(event.requestId, url);
    noteJavaScriptActivity();
  });

  cdp.on("Network.loadingFinished", (event) => {
    const url = requestUrls.get(event.requestId);
    if (!url) return;
    const current = encodedTransfer.get(url) ?? 0;
    encodedTransfer.set(url, Math.max(current, Math.round(event.encodedDataLength || 0)));
    noteJavaScriptActivity();
  });

  page.on("response", (response) => {
    const url = response.url();
    if (!sameOriginStaticJavaScript(url) || scripts.has(url)) return;

    noteJavaScriptActivity();
    const read = response
      .body()
      .then((body) => {
        scripts.set(url, {
          url: new URL(url).pathname,
          rawBytes: body.byteLength,
          gzipBytes: gzipSync(body, { level: 9 }).byteLength,
          status: response.status(),
        });
        noteJavaScriptActivity();
      })
      .catch((error) => {
        scripts.set(url, {
          url: new URL(url).pathname,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    bodyReads.push(read);
  });

  try {
    await page.goto(BASE_URL + route, { waitUntil: "load", timeout: 120_000 });

    // Do not use whole-page networkidle here. Production intentionally performs
    // post-load analytics/announcement requests that are unrelated to the JS
    // budget and can keep the page network-active indefinitely. Instead, wait
    // until the set of current-route JavaScript requests itself becomes quiet.
    const observationStartedAt = Date.now();
    while (true) {
      await page.waitForTimeout(200);

      const now = Date.now();
      const observedFor = now - observationStartedAt;
      const javaScriptQuietFor = now - lastJavaScriptActivityAt;

      if (
        observedFor >= minimumRouteObservationMs &&
        javaScriptQuietFor >= javascriptQuietWindowMs
      ) {
        break;
      }

      if (observedFor >= maximumRouteObservationMs) {
        throw new Error(
          route +
            ": route JavaScript did not stabilize within " +
            maximumRouteObservationMs +
            "ms (last JS activity " +
            javaScriptQuietFor +
            "ms ago)",
        );
      }
    }

    await Promise.allSettled(bodyReads);
  } finally {
    await cdp.detach().catch(() => undefined);
    await context.close();
  }

  const loaded = [...scripts.values()];
  const unreadable = loaded.filter((item) => "error" in item);
  if (unreadable.length > 0) {
    throw new Error(
      route +
        ": unable to read " +
        unreadable.length +
        " loaded JavaScript response(s): " +
        unreadable.map((item) => item.url).join(", "),
    );
  }

  const measured = loaded
    .filter((item) => !("error" in item))
    .map((item) => ({
      ...item,
      transferBytes: encodedTransfer.get(BASE_URL + item.url) ?? 0,
    }))
    .sort((a, b) => b.gzipBytes - a.gzipBytes);

  const totalRawBytes = measured.reduce((sum, item) => sum + item.rawBytes, 0);
  const totalGzipBytes = measured.reduce((sum, item) => sum + item.gzipBytes, 0);
  const totalTransferBytes = measured.reduce((sum, item) => sum + item.transferBytes, 0);
  const largestRaw = measured.reduce((largest, item) => !largest || item.rawBytes > largest.rawBytes ? item : largest, null);
  const largestGzip = measured[0] ?? null;
  const largestTransfer = measured.reduce(
    (largest, item) => !largest || item.transferBytes > largest.transferBytes ? item : largest,
    null,
  );

  return {
    route,
    scriptCount: measured.length,
    totalRawBytes,
    totalGzipBytes,
    totalTransferBytes,
    largestRaw,
    largestGzip,
    largestTransfer,
    scripts: measured,
  };
}

function addBudgetFailures(result, budget, failures) {
  if (result.scriptCount > budget.maxScripts) {
    failures.push(
      result.route + ": loaded " + result.scriptCount + " scripts > " + budget.maxScripts,
    );
  }
  if (result.totalRawBytes > budget.maxRawBytes) {
    failures.push(
      result.route + ": raw loaded JS " + result.totalRawBytes + " bytes > " + budget.maxRawBytes,
    );
  }
  if (result.totalGzipBytes > budget.maxGzipBytes) {
    failures.push(
      result.route + ": gzip loaded JS " + result.totalGzipBytes + " bytes > " + budget.maxGzipBytes,
    );
  }
  if (ENFORCE_TRANSFER && result.totalTransferBytes > budget.maxTransferBytes) {
    failures.push(
      result.route + ": encoded transfer JS " + result.totalTransferBytes + " bytes > " + budget.maxTransferBytes,
    );
  }
  if (result.largestRaw && result.largestRaw.rawBytes > maxSingleRawBytes) {
    failures.push(
      result.route + ": largest raw JS " + result.largestRaw.url + " is " +
      result.largestRaw.rawBytes + " bytes > " + maxSingleRawBytes,
    );
  }
  if (result.largestGzip && result.largestGzip.gzipBytes > maxSingleGzipBytes) {
    failures.push(
      result.route + ": largest gzip JS " + result.largestGzip.url + " is " +
      result.largestGzip.gzipBytes + " bytes > " + maxSingleGzipBytes,
    );
  }
  if (
    ENFORCE_TRANSFER &&
    result.largestTransfer &&
    result.largestTransfer.transferBytes > maxSingleTransferBytes
  ) {
    failures.push(
      result.route + ": largest encoded-transfer JS " + result.largestTransfer.url + " is " +
      result.largestTransfer.transferBytes + " bytes > " + maxSingleTransferBytes,
    );
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  const failures = [];

  try {
    for (const [route, budget] of Object.entries(routeBudgets)) {
      const result = await measureRoute(browser, route);
      results.push(result);
      addBudgetFailures(result, budget, failures);

      console.log(
        [
          "Route " + route,
          result.scriptCount + " runtime-loaded scripts",
          "raw " + result.totalRawBytes + " B",
          "gzip " + result.totalGzipBytes + " B",
          "transfer " + result.totalTransferBytes + " B",
        ].join(": "),
      );
    }
  } finally {
    await browser.close();
  }

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    baselineSha: BASELINE_SHA,
    baselineSource: "exact-production Lighthouse 13.5 artifacts for main " + BASELINE_SHA,
    measurement:
      "JavaScript actually requested by a cold Chromium context per route; marked navigation prefetch is excluded and readiness is based on a bounded JavaScript-only quiet window, not whole-page network idle. Response bodies provide raw/gzip bytes and CDP encodedDataLength provides transfer bytes.",
    enforceTransfer: ENFORCE_TRANSFER,
    maxSingleRawBytes,
    maxSingleGzipBytes,
    maxSingleTransferBytes,
    routeBudgets,
    routes: results,
    failures,
  };

  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2) + "\n");

  if (failures.length > 0) {
    for (const failure of failures) console.error("BUDGET FAIL: " + failure);
    process.exitCode = 1;
    return;
  }

  console.log("PASS route-loaded JavaScript budgets");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
