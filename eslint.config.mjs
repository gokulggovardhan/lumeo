import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const lookupMaybeRestriction = {
  selector: "CallExpression[callee.property.name='lookupMaybe'][arguments.length=2]",
  message:
    "pdf-lib's lookupMaybe(key, Type) THROWS on a wrong-type entry and returns undefined only for a missing one. Use the untyped lookup(key) and check the result with instanceof instead, so a malformed PDF degrades gracefully rather than throwing.",
};

const exportDomMeasurementRestrictions = [
  {
    selector:
      "CallExpression[callee.property.name=/^(getBoundingClientRect|getClientRects|getComputedStyle)$/]",
    message:
      "DOM/CSS measurements are presentation-only and must never become authoritative inside the native PDF export path. Derive export geometry from PDF/native model evidence instead.",
  },
  {
    selector:
      "MemberExpression[property.name=/^(offsetWidth|offsetHeight|clientWidth|clientHeight|scrollWidth|scrollHeight)$/]",
    message:
      "DOM layout dimensions are presentation-only and must never become authoritative inside the native PDF export path. Use PDF/native geometry instead.",
  },
];

const exportAuthorityFiles = [
  "lib/pdf/edit/applyEditPlan.ts",
  "lib/pdf/edit/editPlan.ts",
  "lib/pdf/edit/multiRunEditPlan.ts",
  "lib/pdf/edit/coordinateMapper.ts",
  "lib/pdf/edit/export.ts",
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    // Cloudflare/vinext deployment output. Lint the authored source that
    // produces it, not minified bundles generated during release checks.
    "dist/**",
    "next-env.d.ts",
    // Agent tooling, skills, and any git worktrees checked out beneath it.
    // A worktree here holds a FULL second copy of the repo, so linting it
    // reported ~46,500 problems and made `npm run lint` unusable as a
    // signal -- the number was dominated by a duplicate of the same source.
    ".claude/**",
    // Generated benchmark and analysis output, not authored source.
    "graphify-out/**",
    "e2e/.tmp/**",
    "playwright-report/**",
    "test-results/**",
  ]),
  // pdf-lib's TYPED lookupMaybe(key, Type) reads like a graceful "maybe this
  // type" helper and is not one: it returns undefined only for a MISSING
  // entry, and THROWS UnexpectedObjectTypeError when the entry resolves to
  // the wrong type -- exactly like the strict lookup(key, Type).
  //
  // This has now been got wrong three times. It was fixed once in
  // formXObjects.ts, fixed again across the engine on 2026-08-05 in a commit
  // that never merged, then independently reintroduced in fallbackFont.ts
  // and again in applyRedaction.ts. Every one of those was a malformed PDF
  // throwing where the author expected a graceful undefined. The lint rule
  // is what stops a fourth.
  // Repo-wide, no path exceptions. Scoping it to lib/pdf/** would have left
  // known instances standing in components/ and tests/ -- an inconsistent
  // signal, and "fix it later" has a measured track record here: the last
  // fix sat unmerged for ten days while the same bug was written twice more.
  {
    rules: {
      "no-restricted-syntax": ["error", lookupMaybeRestriction],
    },
  },
  // Export-authority guard: UI code may measure the DOM for hit testing,
  // scrolling and preview layout, but the native PDF writer/planner must
  // never consume browser layout as canonical geometry. Keep the existing
  // lookupMaybe restriction in this scoped override as well so the narrower
  // config cannot accidentally weaken the repo-wide malformed-PDF guard.
  {
    files: exportAuthorityFiles,
    rules: {
      "no-restricted-syntax": [
        "error",
        lookupMaybeRestriction,
        ...exportDomMeasurementRestrictions,
      ],
    },
  },
]);

export default eslintConfig;
