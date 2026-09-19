import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { summarizeHealthStatus } from "../lib/admin/health-status.ts";

function read(path: string) {
  return readFileSync(path, "utf8");
}

test("health summary does not report Operational when a required dependency is unconfigured", () => {
  assert.equal(
    summarizeHealthStatus([
      { status: "ok" },
      { status: "not_configured" },
      { status: "ok" },
    ]),
    "not_configured",
  );
  assert.equal(
    summarizeHealthStatus([
      { status: "not_configured" },
      { status: "degraded" },
    ]),
    "degraded",
  );
  assert.equal(
    summarizeHealthStatus([
      { status: "degraded" },
      { status: "down" },
    ]),
    "down",
  );
});

test("Admin SEO and sitemap share one public route registry", () => {
  const sitemap = read("app/sitemap.ts");
  const seo = read("app/admin/(protected)/seo/page.tsx");
  const routes = read("lib/public-site/routes.ts");

  assert.match(sitemap, /PUBLIC_ROUTE_CONFIG/);
  assert.match(seo, /PUBLIC_ROUTE_PATHS/);
  for (const route of [
    "/heic-to-jpeg",
    "/pdf/organize",
    "/pdf/extract-text",
    "/pdf/edit",
    "/pdf/watermark",
    "/pdf/crop",
    "/pdf/page-numbers",
    "/pdf/header-footer",
    "/pdf/html-to-pdf",
  ]) {
    assert.match(routes, new RegExp(route.replaceAll("/", "\\/")));
  }
});

test("Admin Errors does not render raw stack traces", () => {
  const errorsPage = read("app/admin/(protected)/errors/page.tsx");
  assert.doesNotMatch(errorsPage, /log\.stack/);
  assert.doesNotMatch(errorsPage, /<pre/);
});

test("maintenance mode requires a confirmation before enabling", () => {
  const settings = read("app/admin/(protected)/settings/page.tsx");
  const button = read("components/admin/MaintenanceModeSubmitButton.tsx");

  assert.match(settings, /MaintenanceModeSubmitButton/);
  assert.match(button, /window\.confirm/);
  assert.match(button, /willEnable/);
});
