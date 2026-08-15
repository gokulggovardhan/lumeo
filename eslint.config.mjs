import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Standalone CommonJS container service, built and deployed
    // independently of the Next.js app (see services/word-to-pdf-converter/README.md).
    "services/word-to-pdf-converter/**",
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
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.property.name='lookupMaybe'][arguments.length=2]",
          message:
            "pdf-lib's lookupMaybe(key, Type) THROWS on a wrong-type entry and returns undefined only for a missing one. Use the untyped lookup(key) and check the result with instanceof instead, so a malformed PDF degrades gracefully rather than throwing.",
        },
      ],
    },
  },
]);

export default eslintConfig;
