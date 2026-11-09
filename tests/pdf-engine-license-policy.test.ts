import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

/**
 * Phase 1 policy: guard the existing local-first PDF engine's npm manifest,
 * lockfile identity and selected distribution licences. npm license metadata
 * is a detection gate, not a substitute for reviewing upstream license texts
 * and the application-level notice obligations recorded in the Phase 1 review.
 */
const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
const roots = ["pdf-lib", "pdfjs-dist", "@cantoo/fontkit", "@pdf-lib/fontkit", "jszip"];
const allowedSpdx = new Set(["MIT", "Apache-2.0", "0BSD", "ISC", "BSD-2-Clause", "BSD-3-Clause", "Zlib"]);

function hasPermissiveChoice(expression: string): boolean {
  const normalized = expression.replace(/[()]/g, "");
  return normalized.split(/\s+OR\s+/).some((alternative) =>
    alternative.split(/\s+AND\s+/).every((item) => allowedSpdx.has(item.trim())),
  );
}

test("selected PDF engine dependencies retain a reviewed free licence path", () => {
  const found = new Set<string>();
  const visit = (name: string) => {
    if (found.has(name)) return;
    found.add(name);
    const pkg = lock.packages?.[`node_modules/${name}`];
    assert.ok(pkg, `Missing locked PDF dependency: ${name}`);
    assert.equal(typeof pkg.license, "string", `Missing SPDX metadata for ${name}`);
    assert.ok(
      hasPermissiveChoice(pkg.license),
      `PDF dependency ${name}@${pkg.version} needs licence re-review: ${pkg.license}`,
    );
    for (const child of Object.keys(pkg.dependencies ?? {})) visit(child);
  };

  for (const name of roots) {
    assert.equal(
      manifest.dependencies[name],
      lock.packages?.[""]?.dependencies?.[name],
      `Manifest and lockfile differ for ${name}`,
    );
    visit(name);
  }
  assert.ok(found.size >= roots.length);
});

test("native PDF core remains based on MIT pdf-lib and Apache-2.0 PDF.js", () => {
  assert.equal(lock.packages["node_modules/pdf-lib"].license, "MIT");
  assert.equal(lock.packages["node_modules/pdfjs-dist"].license, "Apache-2.0");
  assert.equal(lock.packages["node_modules/@cantoo/fontkit"].license, "MIT");
  for (const forbidden of ["mupdf", "mupdf-js", "ghostscript", "ghostscript4js"]) {
    assert.equal(manifest.dependencies?.[forbidden], undefined, `AGPL/commercial engine ${forbidden} requires a new legal decision`);
  }
});
