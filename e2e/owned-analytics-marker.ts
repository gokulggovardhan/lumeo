import type { BrowserContext } from "@playwright/test";

export async function installOwnedAnalyticsMarker(context: BrowserContext) {
  await context.addCookies([
    {
      name: "lumeo_synthetic_test",
      value: "1",
      url: "https://lumeo.in",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    },
  ]);

  await context.route("**/api/analytics", async (route) => {
    await route.continue({
      headers: {
        ...route.request().headers(),
        "x-lumeo-synthetic-test": "1",
      },
    });
  });
}
