import { chromium, devices, webkit } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { createRequire } from "node:module";
import { promises as fs } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const axePath = require.resolve("axe-core/axe.min.js");
const baseURL = (process.env.LUMEO_ACCESSIBILITY_BASE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const reportPath = path.resolve("test-results/accessibility/axe-report.json");
const stableSurfaceDelayMs = 1_250;

const results = [];

async function createFixture() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText("Lumeo accessibility fixture", {
    x: 72,
    y: 700,
    size: 18,
    font,
  });
  return Buffer.from(await pdf.save());
}

async function waitForSurface(page) {
  await page.locator("main").first().waitFor({ state: "visible", timeout: 30_000 });
  // Audit the settled UI, not an intermediate ScrollReveal opacity frame.
  // The homepage launcher can delay a card by index * 60ms and then animate
  // opacity for 500ms, so 1.25s covers the complete above-the-fold sequence.
  await page.waitForTimeout(stableSurfaceDelayMs);
}

async function injectAxe(page) {
  const hasAxe = await page.evaluate(() => Boolean(window.axe)).catch(() => false);
  if (!hasAxe) await page.addScriptTag({ path: axePath });
}

async function runAxe(page, name) {
  await injectAxe(page);
  const audit = await page.evaluate(async () => {
    return await window.axe.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
      },
    });
  });

  const violations = audit.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    description: violation.description,
    help: violation.help,
    nodes: violation.nodes.map((node) => ({
      target: node.target,
      html: node.html,
      failureSummary: node.failureSummary,
    })),
  }));

  const blocking = violations.filter(
    (item) => item.impact === "serious" || item.impact === "critical",
  );

  results.push({
    name,
    url: page.url(),
    violations,
    blocking,
  });

  if (blocking.length > 0) {
    const summary = blocking
      .map((item) => `${item.id} (${item.impact}) x${item.nodes.length}`)
      .join(", ");
    throw new Error(`${name}: blocking axe violations: ${summary}`);
  }
}

async function assertKeyboardEntry(page, name) {
  await page.keyboard.press("Tab");
  const active = await page.evaluate(() => ({
    tag: document.activeElement?.tagName ?? "",
    text: document.activeElement?.textContent?.trim() ?? "",
    href:
      document.activeElement instanceof HTMLAnchorElement
        ? document.activeElement.getAttribute("href")
        : null,
  }));

  if (active.tag === "BODY" || active.tag === "HTML" || !active.tag) {
    throw new Error(`${name}: keyboard focus did not enter the page`);
  }
}

async function gotoAndAudit(page, route, name) {
  await page.goto(new URL(route, baseURL).toString(), {
    waitUntil: "load",
    timeout: 120_000,
  });
  await waitForSurface(page);
  await assertKeyboardEntry(page, name);
  await runAxe(page, name);
}

async function auditDesktopChromium() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  try {
    for (const route of ["/", "/pdf", "/pdf-tools", "/pdf/edit"]) {
      await gotoAndAudit(page, route, `desktop Chromium ${route}`);
    }
  } finally {
    await context.close();
    await browser.close();
  }
}

async function auditMobileWebKit() {
  const browser = await webkit.launch({ headless: true });
  const context = await browser.newContext({
    ...devices["iPhone 13"],
  });
  const page = await context.newPage();

  try {
    for (const route of ["/", "/pdf", "/pdf-tools", "/pdf/edit"]) {
      await gotoAndAudit(page, route, `mobile WebKit ${route}`);
    }

    const fixture = await createFixture();
    await page.goto(new URL("/pdf", baseURL).toString(), {
      waitUntil: "load",
      timeout: 120_000,
    });
    await waitForSurface(page);

    await page.setInputFiles("#workspace-pdf-upload", {
      name: "accessibility-fixture.pdf",
      mimeType: "application/pdf",
      buffer: fixture,
    });

    const editButton = page.getByRole("button", { name: "Edit", exact: true });
    await editButton.waitFor({ state: "visible", timeout: 30_000 });
    await editButton.click();
    await page.waitForURL("**/pdf/edit", { timeout: 30_000 });

    const finish = page.getByRole("button", { name: "Finish", exact: true });
    await finish.waitFor({ state: "visible", timeout: 30_000 });
    await runAxe(page, "mobile WebKit connected Workspace Edit");

    await finish.click();
    await page.waitForURL("**/pdf/finish", { timeout: 30_000 });
    await waitForSurface(page);
    await assertKeyboardEntry(page, "mobile WebKit Workspace Finish");
    await runAxe(page, "mobile WebKit Workspace Finish");
  } finally {
    await context.close();
    await browser.close();
  }
}

async function main() {
  try {
    await auditDesktopChromium();
    await auditMobileWebKit();
  } finally {
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify({ results }, null, 2) + "\n");
  }

  const totalViolations = results.reduce(
    (sum, result) => sum + result.violations.length,
    0,
  );
  console.log(
    `PASS accessibility audit: ${results.length} audited surfaces, ${totalViolations} total axe rule groups recorded`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
