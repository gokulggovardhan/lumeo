import { expect, test } from "@playwright/test";
import { TEXT_ONLY_PDF, writeFixtures } from "./fixtures.ts";

test.beforeAll(async () => {
  await writeFixtures();
});

test("vinext Edit PDF exposes matched editable text runs", async ({ page }) => {
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  const editEngineErrors: string[] = [];

  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      message.text().includes("[Edit PDF]")
    ) {
      editEngineErrors.push(message.text());
    }
  });
  page.on("requestfailed", (request) => {
    failedRequests.push(
      `${request.method()} ${request.url()} — ${request.failure()?.errorText ?? "unknown"}`,
    );
  });

  await page.goto("/pdf/edit", { waitUntil: "domcontentloaded" });
  await page.locator('input[type="file"]').first().setInputFiles(TEXT_ONLY_PDF);

  const editable = page.locator(
    'div[role="button"][aria-label^="Editable text: "]',
  );
  await expect
    .poll(
      async () => ({
        editable: await editable.count(),
        diagnostics: editEngineErrors.join(" | "),
      }),
      {
        timeout: 90_000,
        message: "vinext should produce editable runs; browser diagnostics are included in the observed value",
      },
    )
    .toMatchObject({ editable: 1 });

  const labels = await editable.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("aria-label") ?? ""),
  );
  expect(labels.join(" ")).toContain("Employee record");
  expect(labels.join(" ")).toContain("123-45-6789");

  expect(editEngineErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
});
