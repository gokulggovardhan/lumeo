// bench/ocr-gate2/groundTruth.ts
//
// Schema and loader for the corpus's ground-truth files. Every fixture image
// is paired with exactly one JSON file here, and nothing in the harness reads
// a fixture whose ground truth failed validation -- a silently malformed
// truth file would not crash the benchmark, it would quietly produce a
// wrong error rate, which is the one failure mode a benchmark must not have.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

export const CORPUS_CLASSES = ["class-a-clean", "class-b-skewed", "class-c-photos"] as const;
export type CorpusClass = (typeof CORPUS_CLASSES)[number];

// `origin` is deliberately part of the schema rather than a README note.
// Absolute error rates from a simulated page do not transfer to a real
// scanner or phone camera, so every report has to carry that distinction
// with it -- see this directory's README.
export const groundTruthSchema = z.object({
  id: z.string().min(1),
  corpusClass: z.enum(CORPUS_CLASSES),
  /** Image file name, relative to the class directory. */
  image: z.string().min(1),
  /** Exactly what a perfect OCR pass should return, in reading order. */
  text: z.string().min(1),
  origin: z.enum(["synthetic", "synthetic-degraded", "real-scan", "real-photo"]),
  /** Degradations applied, for synthetic-degraded fixtures. Free-form. */
  degradations: z.array(z.string()).default([]),
  notes: z.string().optional(),
});

export type GroundTruth = z.infer<typeof groundTruthSchema>;

export class GroundTruthError extends Error {
  constructor(file: string, detail: string) {
    super(`${file}: ${detail}`);
    this.name = "GroundTruthError";
  }
}

export async function loadGroundTruth(dir: string): Promise<GroundTruth[]> {
  const names = (await readdir(dir)).filter((n) => n.endsWith(".json")).sort();
  const loaded: GroundTruth[] = [];

  for (const name of names) {
    const raw = await readFile(path.join(dir, name), "utf8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new GroundTruthError(name, `not valid JSON (${(error as Error).message})`);
    }
    const result = groundTruthSchema.safeParse(parsed);
    if (!result.success) {
      const issues = result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
      throw new GroundTruthError(name, issues);
    }
    loaded.push(result.data);
  }

  const ids = new Set<string>();
  for (const entry of loaded) {
    if (ids.has(entry.id)) throw new GroundTruthError(`${entry.id}.json`, "duplicate id");
    ids.add(entry.id);
  }
  return loaded;
}
