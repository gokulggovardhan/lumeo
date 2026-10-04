import type { BrowserContext } from "@playwright/test";

export async function installOwnedAnalyticsMarker(context: BrowserContext) {
  await context.route("**/api/analytics", async (route) => {
    await route.continue({
      headers: {
        ...route.request().headers(),
        "x-lumeo-synthetic-test": "1",
      },
    });
  });
}
