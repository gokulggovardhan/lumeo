import { cp, mkdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const packageJsonPath = require.resolve("pdfjs-dist/package.json");
const sourceDir = path.join(path.dirname(packageJsonPath), "standard_fonts");
const destinationDir = path.join(
  process.cwd(),
  "public",
  "pdfjs-standard-fonts",
);

// These are immutable library assets from the exact installed pdfjs-dist
// package, not user-document fonts. Recreate the directory on every app build
// so a dependency upgrade cannot leave stale Standard-14 data behind.
await rm(destinationDir, { recursive: true, force: true });
await mkdir(path.dirname(destinationDir), { recursive: true });
await cp(sourceDir, destinationDir, { recursive: true });

console.log(
  `Prepared PDF.js standard-font assets from ${path.relative(
    process.cwd(),
    sourceDir,
  )}.`,
);
