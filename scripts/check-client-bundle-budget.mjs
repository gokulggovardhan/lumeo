import { createGzip } from "node:zlib";
import { createReadStream, existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";

const ROOT = path.resolve(process.cwd(), "dist/client");
const REPORT_PATH = path.resolve(process.cwd(), "test-results/bundle-budget.json");

const budgets = {
  maxRawChunkBytes: 1_800_000,
  maxGzipChunkBytes: 600_000,
  maxTotalGzipBytes: 5_000_000,
};

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
}

async function gzipSize(file) {
  let bytes = 0;
  const sink = new WritableStream({
    write(chunk) {
      bytes += chunk.byteLength;
    },
  });
  await pipeline(createReadStream(file), createGzip({ level: 9 }), sink);
  return bytes;
}

async function main() {
  if (!existsSync(ROOT)) {
    throw new Error("dist/client does not exist. Run npm run build:vinext first.");
  }

  const jsFiles = (await walk(ROOT)).filter((file) => file.endsWith(".js"));
  if (jsFiles.length === 0) throw new Error("No client JavaScript chunks found.");

  const chunks = [];
  for (const file of jsFiles) {
    const stat = await fs.stat(file);
    chunks.push({
      file: path.relative(ROOT, file).replaceAll(path.sep, "/"),
      rawBytes: stat.size,
      gzipBytes: await gzipSize(file),
    });
  }

  chunks.sort((a, b) => b.gzipBytes - a.gzipBytes);
  const totalRawBytes = chunks.reduce((sum, item) => sum + item.rawBytes, 0);
  const totalGzipBytes = chunks.reduce((sum, item) => sum + item.gzipBytes, 0);
  const largest = chunks[0];

  const failures = [];
  if (largest.rawBytes > budgets.maxRawChunkBytes) {
    failures.push(
      `largest raw JS chunk ${largest.file} is ${largest.rawBytes} bytes > ${budgets.maxRawChunkBytes}`,
    );
  }
  if (largest.gzipBytes > budgets.maxGzipChunkBytes) {
    failures.push(
      `largest gzipped JS chunk ${largest.file} is ${largest.gzipBytes} bytes > ${budgets.maxGzipChunkBytes}`,
    );
  }
  if (totalGzipBytes > budgets.maxTotalGzipBytes) {
    failures.push(
      `total gzipped client JS is ${totalGzipBytes} bytes > ${budgets.maxTotalGzipBytes}`,
    );
  }

  const report = {
    generatedAt: new Date().toISOString(),
    root: "dist/client",
    budgets,
    summary: {
      chunkCount: chunks.length,
      totalRawBytes,
      totalGzipBytes,
      largest,
    },
    chunks,
    failures,
  };

  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2) + "\n");

  const mb = (value) => (value / 1024 / 1024).toFixed(2);
  console.log(`Client JS chunks: ${chunks.length}`);
  console.log(
    `Largest: ${largest.file} raw ${mb(largest.rawBytes)} MiB / gzip ${mb(largest.gzipBytes)} MiB`,
  );
  console.log(
    `Total client JS: raw ${mb(totalRawBytes)} MiB / gzip ${mb(totalGzipBytes)} MiB`,
  );
  console.table(
    chunks.slice(0, 15).map((item) => ({
      file: item.file,
      rawKiB: Math.round(item.rawBytes / 1024),
      gzipKiB: Math.round(item.gzipBytes / 1024),
    })),
  );

  if (failures.length > 0) {
    for (const failure of failures) console.error(`BUDGET FAIL: ${failure}`);
    process.exitCode = 1;
  } else {
    console.log("PASS client JavaScript bundle budgets");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
