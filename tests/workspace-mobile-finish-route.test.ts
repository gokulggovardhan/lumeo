import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mobileNav = readFileSync(
  "components/pdf/workspace/WorkspaceMobileNav.tsx",
  "utf8",
);

test("Finish active state follows the actual Finish route as well as Workspace session state", () => {
  assert.match(
    mobileNav,
    /const finishActive =\s*pathname === routeForArea\("export"\) \|\| activeArea === "export"/,
  );
  assert.match(
    mobileNav,
    /aria-current=\{finishActive \? "page" : undefined\}/,
  );
  assert.match(
    mobileNav,
    /\(finishActive\s*\? "bg-\[var\(--surface-selected\)\]/,
  );
});
