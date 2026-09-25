import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveEffectivePublicToolState } from "../lib/tools/public-state.ts";
import type { PublicToolStatus } from "../lib/public-catalog/types.ts";

const expectedByStatus: Record<PublicToolStatus, { discoverable: boolean; usable: boolean }> = {
  active: { discoverable: true, usable: true },
  beta: { discoverable: true, usable: true },
  coming_soon: { discoverable: true, usable: false },
  maintenance: { discoverable: true, usable: false },
  hidden: { discoverable: false, usable: false },
};

test("effective public tool state covers every enabled status without contradictions", () => {
  for (const [status, expected] of Object.entries(expectedByStatus) as Array<
    [PublicToolStatus, { discoverable: boolean; usable: boolean }]
  >) {
    assert.deepEqual(
      resolveEffectivePublicToolState({ status, isEnabled: true, maintenanceMessage: " Planned work " }),
      {
        status,
        discoverable: expected.discoverable,
        usable: expected.usable,
        message: "Planned work",
      },
    );
  }
});

test("disabled and missing catalog records fail closed as hidden", () => {
  for (const status of Object.keys(expectedByStatus) as PublicToolStatus[]) {
    const state = resolveEffectivePublicToolState({ status, isEnabled: false });
    assert.equal(state.status, "hidden");
    assert.equal(state.discoverable, false);
    assert.equal(state.usable, false);
  }

  assert.deepEqual(resolveEffectivePublicToolState(null), {
    status: "hidden",
    discoverable: false,
    usable: false,
    message: null,
  });
});

test("discovery and direct routes share the effective-state policy", () => {
  const resolver = readFileSync("lib/tools/resolve.ts", "utf8");
  const routeGate = readFileSync("lib/tools/tool-status.ts", "utf8");
  assert.match(resolver, /resolveEffectivePublicToolState\(dbTool\)/);
  assert.match(routeGate, /resolveEffectivePublicToolState\(dbTool\)/);
  assert.doesNotMatch(routeGate, /if \(!dbTool\) return \{ blocked: false \}/);
});

test("every functional public tool route renders behind the server state gate", () => {
  const routes: Record<string, string> = {
    "app/heic-to-jpeg/page.tsx": "heic-to-jpeg",
    "app/pdf/compress/page.tsx": "compress",
    "app/pdf/crop/page.tsx": "crop",
    "app/pdf/edit/page.tsx": "edit",
    "app/pdf/extract-text/page.tsx": "extract-text",
    "app/pdf/header-footer/page.tsx": "header-footer",
    "app/pdf/html-to-pdf/page.tsx": "html-to-pdf",
    "app/pdf/jpg-to-pdf/page.tsx": "jpg-to-pdf",
    "app/pdf/merge/page.tsx": "merge",
    "app/pdf/organize/page.tsx": "reorder",
    "app/pdf/page-numbers/page.tsx": "page-numbers",
    "app/pdf/pdf-to-jpg/page.tsx": "pdf-to-jpg",
    "app/pdf/pdf-to-word/page.tsx": "pdf-to-word",
    "app/pdf/sign/page.tsx": "sign",
    "app/pdf/split/page.tsx": "split",
    "app/pdf/watermark/page.tsx": "watermark",
    "app/pdf/word-to-pdf/page.tsx": "word-to-pdf",
  };

  for (const [path, slug] of Object.entries(routes)) {
    const source = readFileSync(path, "utf8");
    assert.match(source, new RegExp(`getToolBlockedState\\(\"${slug}\"\\)`), path);
    assert.match(source, /\.blocked\s*\?/, path);
    assert.match(source, /ToolMaintenanceNotice/, path);
  }
});

test("catalog fallback keeps every functional gated route available", () => {
  const fallback = readFileSync("lib/public-catalog/fallback.ts", "utf8");
  const registry = readFileSync("components/pdf/PdfToolRegistry.tsx", "utf8");

  assert.match(fallback, /const localTools = pdfTools\.map/);
  assert.match(fallback, /tool\.slug === "organize" \? "reorder" : tool\.slug/);
  for (const slug of ["crop", "page-numbers", "header-footer", "heic-to-jpeg"]) {
    assert.match(fallback, new RegExp(`slug: "${slug}"`));
  }
  for (const slug of [
    "merge",
    "split",
    "compress",
    "jpg-to-pdf",
    "pdf-to-jpg",
    "sign",
    "word-to-pdf",
    "pdf-to-word",
    "organize",
    "html-to-pdf",
    "extract-text",
    "edit",
    "watermark",
  ]) {
    assert.match(registry, new RegExp(`slug: "${slug}"`));
  }
});

test("homepage exposes truthful beta and unavailable states without actionable links", () => {
  const source = readFileSync("components/pdf/PdfToolLauncher.tsx", "utf8");
  assert.match(source, /buildDiscoveryTiles\(resolved\)/);
  assert.match(source, /tile\.availability === "active" \|\| tile\.availability === "beta"/);
  assert.match(source, /Coming soon/);
  assert.match(source, /Maintenance/);
  assert.match(source, /available \? \(/);
  assert.match(source, /<article/);
});

test("homepage surfaces every non-curated coming-soon tool exactly once", () => {
  const source = readFileSync("components/pdf/PdfToolLauncher.tsx", "utf8");
  assert.match(source, /const curatedRoutes = new Set/);
  assert.match(
    source,
    /tile\.availability === "coming_soon" && !curatedRoutes\.has\(tile\.route\)/,
  );
  assert.match(source, /comingSoon\.length > 0/);
  assert.match(source, /coming-soon-tools-heading/);
  assert.match(source, /These tools are visible for discovery, but cannot be opened/);
});

test("Admin saves verify an updated row, audit maintenance copy, and invalidate the shared cache", () => {
  const source = readFileSync("app/admin/(protected)/tools/actions.ts", "utf8");
  assert.match(source, /\.select\("id"\)[\s\S]*\.maybeSingle\(\)/);
  assert.match(source, /error \|\| !updatedTool/);
  assert.match(source, /maintenance_message: maintenanceMessage \|\| null/);
  assert.match(source, /updateTag\("public-pdf-catalog"\)/);
});

test("Admin layout and pages share request-scoped authorization reads", () => {
  const auth = readFileSync("lib/admin/auth.ts", "utf8");
  assert.match(auth, /const getRequestAdminContext = cache\(/);
});


test("Admin maintenance semantics are driven by status, not stale message text", () => {
  const filters = readFileSync("lib/admin/tool-filters.ts", "utf8");
  const page = readFileSync("app/admin/(protected)/tools/page.tsx", "utf8");
  assert.match(filters, /const inMaintenance = tool\.status === "maintenance"/);
  assert.doesNotMatch(filters, /tool\.status === "maintenance" \|\| Boolean\(tool\.maintenance_message\)/);
  assert.match(page, /Tools currently in the maintenance state/);
  assert.match(page, /Message saved; inactive until maintenance/);
  assert.match(page, /Hidden = removed from discovery and blocked/);
  assert.match(page, /Enabled publicly off always removes and blocks the tool/);
});
