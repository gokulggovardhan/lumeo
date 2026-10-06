import { chromium } from "@playwright/test";
import { gzipSync } from "node:zlib";
import { promises as fs } from "node:fs";
import path from "node:path";

const BASE_URL = (process.env.LUMEO_BUNDLE_BASE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const REPORT_PATH = path.resolve(process.cwd(), "test-results/bundle-budget.json");

const routeBudgets = {
  "/": { maxGzipBytes: 2_000_000 },
  "/pdf": { maxGzipBytes: 2_500_000 },
  "/pdf-tools": { maxGzipBytes: 2_500_000 },
  "/pdf/edit": { maxGzipBytes: 4_000_000 },
};

const maxSingleGzipBytes = 1_500_000;

function isMeasuredScript(url) {
  try {
    const parsed = new URL(url);
    return (
      parsed.origin === new URL(BASE_URL).origin &&
      parsed.pathname.includes("/_next/static/") &&
      parsed.pathname.endsWith(".js")
    );
  } catch {
    return false;
  }
}

async function measureRoute(browser, route) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const scripts = new Map();

  page.on("response", async (response) => {
    const url = response.url();
    if (!isMeasuredScript(url)) return;
    if (scripts.has(url)) return;
    try {
      const body = await response.body();
      scripts.set(url, {
        url: new URL(url).pathname,
        rawBytes: body.byteLength,
        gzipBytes: gzipSync(body, { level: 9 }).byteLength,
      });
    } catch (error) {
      scripts.set(url, {
        url: new URL(url).pathname,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  await page.goto(BASE_URL + route, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForTimeout(500);

  const loaded = [...scripts.values()];
  await context.close();

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

  const js = loaded
    .filter((item) => !("error" in item))
    .sort((a, b) => b.gzipBytes - a.gzipBytes);
  const totalRawBytes = js.reduce((sum, item) => sum + item.rawBytes, 0);
  const totalGzipBytes = js.reduce((sum, item) => sum + item.gzipBytes, 0);
  const largest = js[0] ?? null;

  return {
    route,
    scriptCount: js.length,
    totalRawBytes,
    totalGzipBytes,
    largest,
    scripts: js,
  };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const routes = [];
  const failures = [];

  try {
    for (const route of Object.keys(routeBudgets)) {
      const result = await measureRoute(browser, route);
      routes.push(result);

      const routeBudget = routeBudgets[route];
      if (result.totalGzipBytes > routeBudget.maxGzipBytes) {
        failures.push(
          route +
            ": loaded gzip JS " +
            result.totalGzipBytes +
            " bytes > " +
            routeBudget.maxGzipBytes,
        );
      }

      if (result.largest && result.largest.gzipBytes > maxSingleGzipBytes) {
        failures.push(
          route +
            ": largest loaded JS " +
            result.largest.url +
            " is " +
            result.largest.gzipBytes +
            " gzip bytes > " +
            maxSingleGzipBytes,
        );
      }

      console.log(
        "Route " +
          route +
          ": " +
          result.scriptCount +
          " scripts, raw " +
          result.totalRawBytes +
          " bytes, gzip " +
          result.totalGzipBytes +
          " bytes",
      );
      if (result.largest) {
        console.log(
          "  Largest loaded chunk: " +
            result.largest.url +
            " (" +
            result.largest.gzipBytes +
            " gzip bytes)",
        );
      }
    }
  } finally {
    await browser.close();
  }

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    measurement: "JavaScript actually requested by each route before network idle",
    maxSingleGzipBytes,
    routeBudgets,
    routes,
    failures,
  };

  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2) + "\n");

  if (failures.length > 0) {
    for (const failure of failures) console.error("BUDGET FAIL: " + failure);
    process.exitCode = 1;
    return;
  }

  console.log("PASS per-route client JavaScript bundle budgets");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
