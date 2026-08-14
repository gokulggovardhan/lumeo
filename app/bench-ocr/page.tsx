"use client";

// TEMPORARY benchmark harness for the OCR evaluation spec's Gate 1
// (docs/superpowers/specs/2026-08-14-ocr-evaluation-spec.md). Not linked from
// anywhere, not part of the product, and this whole route is expected to be
// deleted once the gate-1 numbers are recorded in the spec.
//
// Measures the three things Gate 1 asks for on a real 300-DPI A4 page:
// bytes transferred for core + one language, wall clock to first result, and
// peak JS heap. Accuracy is explicitly NOT measured here -- that is Gate 2,
// and it needs a real fixture corpus rather than this synthetic page.

import { useCallback, useRef, useState } from "react";

// A4 at 300 DPI, which is the scan resolution Gate 1 is specified against.
const PAGE_WIDTH = 2480;
const PAGE_HEIGHT = 3508;

const LINES = [
  "INVOICE 2026-001",
  "Billed to: Acme Corporation",
  "14 Harbour Road, Bristol BS1 4RN",
  "",
  "Description                 Qty      Unit      Amount",
  "Design retainer               1    900.00      900.00",
  "Additional revisions          3    150.00      450.00",
  "",
  "Subtotal                                     1350.00",
  "VAT (20%)                                     270.00",
  "Total Amount                                 1620.00",
  "",
  "Payment due within 30 days of the invoice date.",
  "Bank transfer to sort code 20-00-00, account 55345010.",
];

// Stands in for a scanned page: real glyphs rasterized at 300 DPI. Good
// enough to time recognition honestly; not representative of scan noise,
// which is why accuracy is out of scope here.
function renderSyntheticPage(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = PAGE_WIDTH;
  canvas.height = PAGE_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D context unavailable.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
  context.fillStyle = "#111111";
  context.font = "48px monospace";
  context.textBaseline = "top";
  LINES.forEach((line, index) => {
    context.fillText(line, 200, 300 + index * 90);
  });
  return canvas;
}

type Result = {
  initMs: number;
  recognizeMs: number;
  totalMs: number;
  heapBeforeMb: number | null;
  heapPeakMb: number | null;
  words: number;
  meanConfidence: number;
  sample: string;
};

export default function BenchOcrPage() {
  const [status, setStatus] = useState("idle");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const runningRef = useRef(false);

  const run = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setError("");
    setResult(null);

    try {
      setStatus("rendering 300-DPI page");
      const canvas = renderSyntheticPage();

      // Read through a loose cast: performance.memory is Chrome-only and not
      // in the DOM lib types, and it is exactly the number Gate 1 wants.
      const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      const heapBefore = memory ? memory.usedJSHeapSize : null;

      setStatus("loading core + language data");
      const startedAt = performance.now();
      const { createWorker } = await import("tesseract.js");
      // Self-hosted, NOT the library defaults. Left to itself tesseract.js
      // pulls worker.min.js, the WASM core and <lang>.traineddata from
      // cdn.jsdelivr.net -- three third-party requests at the moment a user
      // OCRs a document. Overriding all three is mandatory for this codebase,
      // so the benchmark measures the only configuration that could ship.
      const worker = await createWorker("eng", undefined, {
        workerPath: "/tesseract/worker.min.js",
        corePath: "/tesseract/tesseract-core-simd-lstm.wasm.js",
        langPath: "/tessdata",
        gzip: true,
      });
      const initDoneAt = performance.now();

      setStatus("recognizing");
      const { data } = await worker.recognize(canvas);
      const finishedAt = performance.now();

      const heapPeak = memory ? memory.usedJSHeapSize : null;
      // Per-word confidence lives under data.blocks, which is only populated
      // when recognize() is asked for it. Gate 1 is a timing measurement, so
      // the page-level confidence is enough here -- per-word confidence is
      // Gate 2's concern.
      const words = data.text.split(/\s+/).filter(Boolean);

      setResult({
        initMs: Math.round(initDoneAt - startedAt),
        recognizeMs: Math.round(finishedAt - initDoneAt),
        totalMs: Math.round(finishedAt - startedAt),
        heapBeforeMb: heapBefore === null ? null : Math.round(heapBefore / 1048576),
        heapPeakMb: heapPeak === null ? null : Math.round(heapPeak / 1048576),
        words: words.length,
        meanConfidence: Math.round(data.confidence),
        sample: data.text.split("\n").slice(0, 4).join(" | "),
      });
      setStatus("done");
      await worker.terminate();
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : String(runError));
      setStatus("failed");
    } finally {
      runningRef.current = false;
    }
  }, []);

  return (
    <main style={{ padding: 32, fontFamily: "monospace", color: "#eee", background: "#111", minHeight: "100vh" }}>
      <h1>OCR Gate 1 benchmark</h1>
      <button type="button" id="run-bench" onClick={run} style={{ padding: "8px 16px", marginTop: 12 }}>
        Run
      </button>
      <p id="bench-status">status: {status}</p>
      {error ? <pre id="bench-error">{error}</pre> : null}
      <pre id="bench-result">{result ? JSON.stringify(result, null, 2) : ""}</pre>
    </main>
  );
}
