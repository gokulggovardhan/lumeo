import { chromium, devices } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { createRequire } from "node:module";
import { promises as fs } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const axePath = require.resolve("axe-core/axe.min.js");
const baseURL = process.env.LUMEO_ACCESSIBILITY_BASE_URL || "http://127.0.0.1:8787";
const reportPath = path.resolve("test-results/accessibility/axe-report.json");

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

async function injectAxe(page) {
  await page.addScriptTag({ path: axePath });
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

  const blocking = violations.filter((item) =>
    item.impact === "serious" || item.impact === "critical",
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

async function auditPublicPages(browser) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  for (const route of ["/", "/pdf-tools", "/pdf", "/pdf/edit"]) {
    await page.goto(new URL(route, baseURL).toString(), {
      waitUntil: "networkidle",
    });
    await assertKeyboardEntry(page, `desktop ${route}`);
    await runAxe(page, `desktop ${route}`);
  }

  await context.close();
}

async function auditConnectedMobileWorkspace(browser) {
  const context = await browser.newContext({
    ...devices["iPhone 13"],
  });
  const page = await context.newPage();
  const fixture = await createFixture();

  await page.goto(new URL("/pdf", baseURL).toString(), {
    waitUntil: "networkidle",
  });
  await page.setInputFiles("#workspace-pdf-upload", {
    name: "accessibility-fixture.pdf",
    mimeType: "application/pdf",
    buffer: fixture,
  });

  const editButton = page.getByRole("button", { name: "Edit" });
  await editButton.waitFor({ state: "visible" });
  await editButton.click();
  await page.waitForURL("**/pdf/edit");
  await page.waitForLoadState("networkidle");
  await runAxe(page, "mobile connected Workspace Edit");

  const finish = page.getByRole("button", { name: "Finish" });
  await finish.waitFor({ state: "visible" });
  await finish.click();
  await page.waitForURL("**/pdf/finish");
  await page.waitForLoadState("networkidle");
  await assertKeyboardEntry(page, "mobile Workspace Finish");
  await runAxe(page, "mobile Workspace Finish");

  await context.close();
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  try {
    await auditPublicPages(browser);
    await auditConnectedMobileWorkspace(browser);
  } finally {
    await browser.close();
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify({ results }, null, 2) + "\n");
  }

  const totalViolations = results.reduce(
    (sum, result) => sum + result.violations.length,
    0,
  );
  console.log(
    `PASS accessibility audit: ${results.length} surfaces, ${totalViolations} non-blocking/total axe rule groups recorded`,
  );
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
