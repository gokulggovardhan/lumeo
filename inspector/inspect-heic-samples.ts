import path from "node:path";
import process from "node:process";
import { inspectSampleDirectory, type ValidationMode } from "../lib/heic-to-jpeg/inspection/index.ts";

type Arguments = { sourceFolder: string; outputFolder: string; validationMode: ValidationMode };

function parseArguments(values: string[]): Arguments {
  let sourceFolder = "";
  let outputFolder = path.join(process.cwd(), "inspector-output");
  let validationMode: ValidationMode = "real";
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--synthetic") {
      validationMode = "synthetic";
    } else if (value === "--output") {
      const next = values[index + 1];
      if (!next) throw new Error("--output requires a folder path.");
      outputFolder = next;
      index += 1;
    } else if (value.startsWith("--")) {
      throw new Error(`Unknown option: ${value}`);
    } else if (!sourceFolder) {
      sourceFolder = value;
    } else {
      throw new Error(`Unexpected argument: ${value}`);
    }
  }
  if (!sourceFolder) throw new Error("Usage: npm run inspect:heic-samples -- <folder> [--output <folder>] [--synthetic]");
  return { sourceFolder, outputFolder, validationMode };
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  const { report } = await inspectSampleDirectory(options);
  process.stdout.write(`${JSON.stringify({
    outputFolder: path.resolve(options.outputFolder),
    ...report.summary,
  }, null, 2)}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Inspection failed.";
  process.stderr.write(`HEIC sample inspection could not start: ${message}\n`);
  process.exitCode = 1;
});
