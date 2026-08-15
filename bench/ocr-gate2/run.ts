// bench/ocr-gate2/run.ts
//
// The Gate 2 harness: runs Tesseract over every corpus fixture, scores it
// against ground truth, and writes reports/latest.json.
//
//   node --no-warnings --experimental-strip-types bench/ocr-gate2/setupAssets.ts
//   node --no-warnings --experimental-strip-types bench/ocr-gate2/generateCorpus.ts
//   node --no-warnings --experimental-strip-types bench/ocr-gate2/run.ts
//
// Runs in Node rather than a browser. Accuracy is a property of the WASM
// core and the language model, both identical in either host, and Node
// makes the run deterministic and scriptable -- Gate 1 already measured the
// things that ARE host-specific (download size, wall clock, memory).

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createWorker } from "tesseract.js";
import { aggregateErrorRate, characterErrorRate, wordErrorRate, type ErrorRate } from "./evaluate.ts";
import { CORPUS_CLASSES, loadGroundTruth, type CorpusClass, type GroundTruth } from "./groundTruth.ts";
import { PROPOSED_THRESHOLDS } from "./thresholds.ts";
import { LANG, TESSDATA_DIR, assetsPresent } from "./setupAssets.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.join(HERE, "reports");

/**
 * Gate 1a established that tesseract.js defaults every asset path to
 * cdn.jsdelivr.net, and that overriding them is a hard requirement for this
 * product rather than a preference. A comment saying "we set langPath" is
 * not evidence. This replaces global fetch for the duration of the run and
 * records any non-local request, so the report can state zero external
 * requests as a measurement instead of an intention.
 */
function installFetchGuard(): { externalRequests: string[]; restore: () => void } {
  const externalRequests: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (/^https?:\/\//i.test(url)) {
      externalRequests.push(url);
      throw new Error(`Gate 2 forbids external requests during a run; attempted ${url}`);
    }
    return original(input as RequestInfo, init);
  }) as typeof globalThis.fetch;
  return { externalRequests, restore: () => { globalThis.fetch = original; } };
}

type FixtureResult = {
  id: string;
  corpusClass: CorpusClass;
  image: string;
  origin: GroundTruth["origin"];
  degradations: string[];
  recognizeMs: number;
  confidence: number;
  cer: ErrorRate;
  wer: ErrorRate;
  /** First 240 characters of what Tesseract returned, for eyeballing. */
  outputPreview: string;
};

type ClassSummary = {
  corpusClass: CorpusClass;
  fixtures: number;
  cer: number;
  wer: number;
  meanConfidence: number;
  meanRecognizeMs: number;
  threshold: { cer: number; wer: number };
  meetsCer: boolean;
  meetsWer: boolean;
};

async function main(): Promise<void> {
  if (!(await assetsPresent())) {
    throw new Error("Language model missing. Run bench/ocr-gate2/setupAssets.ts first.");
  }

  const truths = await loadGroundTruth(path.join(HERE, "ground-truth"));
  if (truths.length === 0) {
    throw new Error("No ground truth found. Run bench/ocr-gate2/generateCorpus.ts first.");
  }

  const guard = installFetchGuard();
  const results: FixtureResult[] = [];
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;

  try {
    // Every path local: the core resolves from node_modules in Node (no CDN
    // by construction), and langPath is pinned at our own assets directory.
    worker = await createWorker(LANG, undefined, {
      langPath: TESSDATA_DIR,
      cachePath: TESSDATA_DIR,
      gzip: true,
    });

    for (const truth of truths) {
      const imagePath = path.join(HERE, truth.corpusClass, truth.image);
      const image = await readFile(imagePath);

      const startedAt = performance.now();
      const { data } = await worker.recognize(image);
      const recognizeMs = Math.round(performance.now() - startedAt);

      results.push({
        id: truth.id,
        corpusClass: truth.corpusClass,
        image: truth.image,
        origin: truth.origin,
        degradations: truth.degradations,
        recognizeMs,
        confidence: Math.round(data.confidence * 10) / 10,
        cer: characterErrorRate(truth.text, data.text),
        wer: wordErrorRate(truth.text, data.text),
        outputPreview: data.text.replace(/\s+/g, " ").trim().slice(0, 240),
      });

      const last = results[results.length - 1];
      console.log(
        `${truth.id.padEnd(28)} CER ${last.cer.rate.toFixed(4)}  WER ${last.wer.rate.toFixed(4)}  conf ${last.confidence}  ${recognizeMs}ms`,
      );
    }
  } finally {
    await worker?.terminate();
    guard.restore();
  }

  const classes: ClassSummary[] = CORPUS_CLASSES.map((corpusClass) => {
    const inClass = results.filter((r) => r.corpusClass === corpusClass);
    const threshold = PROPOSED_THRESHOLDS[corpusClass];
    const cer = aggregateErrorRate(inClass.map((r) => r.cer)).rate;
    const wer = aggregateErrorRate(inClass.map((r) => r.wer)).rate;
    return {
      corpusClass,
      fixtures: inClass.length,
      cer,
      wer,
      meanConfidence: inClass.length ? Number((inClass.reduce((s, r) => s + r.confidence, 0) / inClass.length).toFixed(1)) : 0,
      meanRecognizeMs: inClass.length ? Math.round(inClass.reduce((s, r) => s + r.recognizeMs, 0) / inClass.length) : 0,
      threshold,
      meetsCer: cer <= threshold.cer,
      meetsWer: wer <= threshold.wer,
    };
  });

  const report = {
    generatedAt: new Date().toISOString(),
    gate: "2 -- accuracy",
    engine: {
      library: "tesseract.js",
      language: LANG,
      // Recorded because a model change moves every number in this file.
      model: "4.0.0_best_int",
      host: "node",
      assetSource: "self-hosted (bench/ocr-gate2/assets/tessdata)",
    },
    externalRequestsDuringRun: guard.externalRequests,
    zeroExternalRequests: guard.externalRequests.length === 0,
    normalization: { form: "NFC", collapseWhitespace: true, ignoreCase: false },
    thresholdsAreProposals: true,
    classes,
    fixtures: results,
    caveat:
      "class-b and class-c fixtures are SIMULATED degradation, not real scanner or camera captures. " +
      "These rates are sound for comparing configurations and for showing how error scales with quality; " +
      "they are not a basis for a shippable absolute threshold on real-world photos.",
  };

  await mkdir(REPORTS_DIR, { recursive: true });
  await writeFile(path.join(REPORTS_DIR, "latest.json"), `${JSON.stringify(report, null, 2)}\n`);

  console.log("\nper class:");
  for (const summary of classes) {
    const verdict = summary.meetsCer && summary.meetsWer ? "MEETS" : "MISSES";
    console.log(
      `  ${summary.corpusClass.padEnd(16)} CER ${summary.cer.toFixed(4)} (target ${summary.threshold.cer})  ` +
        `WER ${summary.wer.toFixed(4)} (target ${summary.threshold.wer})  ${verdict} proposed target`,
    );
  }
  console.log(`\nexternal requests during run: ${guard.externalRequests.length}`);
  console.log(`report: ${path.join(REPORTS_DIR, "latest.json")}`);
}

await main();
