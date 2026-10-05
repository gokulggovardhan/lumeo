import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const input = path.join(root, "public", "brand", "lumeo-pdf-mark.png");
const output = path.join(root, "public", "brand", "lumeo-pdf-mark-96.webp");
const MAX_BYTES = 20_000;

async function main() {
  await fs.access(input);
  await sharp(input)
    .resize(96, 96, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({
      quality: 82,
      effort: 6,
      smartSubsample: true,
    })
    .toFile(output);

  const stat = await fs.stat(output);
  if (stat.size > MAX_BYTES) {
    throw new Error(
      `Optimized brand mark is ${stat.size} bytes; expected <= ${MAX_BYTES}.`,
    );
  }

  console.log(
    `Prepared static brand mark: public/brand/lumeo-pdf-mark-96.webp (${stat.size} bytes)`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
