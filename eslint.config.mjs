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
]);

export default eslintConfig;
