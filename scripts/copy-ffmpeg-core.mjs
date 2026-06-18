import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const sourceDir = join(rootDir, "node_modules", "@ffmpeg", "core", "dist", "umd");
const targetDir = join(rootDir, "public", "ffmpeg", "0.12.10");
const coreFiles = ["ffmpeg-core.js", "ffmpeg-core.wasm", "ffmpeg-core.worker.js"];

if (!existsSync(sourceDir)) {
  console.warn(`FFmpeg core source folder not found: ${sourceDir}`);
  process.exit(0);
}

mkdirSync(targetDir, { recursive: true });

for (const fileName of coreFiles) {
  const sourcePath = join(sourceDir, fileName);
  const targetPath = join(targetDir, fileName);

  if (!existsSync(sourcePath)) {
    console.warn(`Skipping missing FFmpeg core file: ${fileName}`);
    continue;
  }

  copyFileSync(sourcePath, targetPath);
  console.log(`Copied ${fileName} to public/ffmpeg/0.12.10`);
}
