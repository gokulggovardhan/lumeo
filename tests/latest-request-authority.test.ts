import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createLatestRequestAuthority } from "../lib/pdf/latestRequestAuthority.ts";

test("latest request authority rejects older async work and explicit invalidation", () => {
  const authority = createLatestRequestAuthority();
  const first = authority.begin();
  assert.equal(authority.isCurrent(first), true);

  const second = authority.begin();
  assert.equal(authority.isCurrent(first), false);
  assert.equal(authority.isCurrent(second), true);

  authority.invalidate();
  assert.equal(authority.isCurrent(second), false);
});

test("Sign upload checks latest-file authority before publishing or reporting errors", async () => {
  const source = await readFile(
    new URL("../components/pdf/SignPdfTool.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /const loadToken = fileLoadAuthorityRef\.current\.begin\(\)/);
  assert.equal(
    source.match(/fileLoadAuthorityRef\.current\.isCurrent\(loadToken\)/g)?.length,
    3,
  );
  assert.match(source, /const startNew = \(\) => \{\s*fileLoadAuthorityRef\.current\.invalidate\(\)/);
});
