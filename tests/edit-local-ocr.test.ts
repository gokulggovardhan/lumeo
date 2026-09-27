import assert from "node:assert/strict";
import test from "node:test";
import {
  OCR_MAX_DIMENSION_PX,
  OCR_MAX_TOTAL_PIXELS,
  OCR_TARGET_DPI,
  computeOcrRenderScale,
  createLocalOcrEngine,
  localOcrAssetUrls,
  ocrWordsFromBlocks,
} from "../lib/pdf/edit/localOcr.ts";

test("local OCR assets stay on the application origin", () => {
  const urls = localOcrAssetUrls("https://lumeo.in/workspace");
  assert.equal(urls.workerPath, "https://lumeo.in/ocr/tesseract/worker.min.js");
  assert.equal(urls.corePath, "https://lumeo.in/ocr/tesseract-core");
  assert.equal(urls.langPath, "https://lumeo.in/ocr/tessdata");
  for (const value of Object.values(urls)) {
    assert.equal(new URL(value).origin, "https://lumeo.in");
  }
});

test("local OCR rejects non-web origins", () => {
  assert.throws(() => localOcrAssetUrls("file:///tmp/lumeo"), /http\(s\)/i);
});

test("OCR render scale targets 220 DPI for ordinary pages", () => {
  const scale = computeOcrRenderScale(612, 792);
  assert.equal(scale, OCR_TARGET_DPI / 72);
});

test("OCR render scale caps both dimension and total pixels", () => {
  const scale = computeOcrRenderScale(5200, 5200);
  assert.ok(5200 * scale <= OCR_MAX_DIMENSION_PX + 1e-6);
  assert.ok(5200 * scale * (5200 * scale) <= OCR_MAX_TOTAL_PIXELS + 1);
});

test("OCR word geometry is normalized to percent space and tagged as OCR", () => {
  const words = ocrWordsFromBlocks(
    [
      {
        paragraphs: [
          {
            lines: [
              {
                words: [
                  {
                    text: "  Invoice ",
                    confidence: 94.5,
                    bbox: { x0: 100, y0: 50, x1: 300, y1: 100 },
                  },
                  {
                    text: "",
                    confidence: 88,
                    bbox: { x0: 0, y0: 0, x1: 10, y1: 10 },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    1000,
    500,
  );

  assert.deepEqual(words, [
    {
      textSource: "ocr",
      text: "Invoice",
      confidence: 94.5,
      boundsPct: {
        xPct: 10,
        yPct: 10,
        widthPct: 20,
        heightPct: 10,
      },
    },
  ]);
});

test("OCR geometry clamps hostile or out-of-range boxes", () => {
  const [word] = ocrWordsFromBlocks(
    [
      {
        paragraphs: [
          {
            lines: [
              {
                words: [
                  {
                    text: "Edge",
                    confidence: 120,
                    bbox: { x0: -20, y0: -10, x1: 1200, y1: 600 },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    1000,
    500,
  );

  assert.equal(word.confidence, 100);
  assert.deepEqual(word.boundsPct, {
    xPct: 0,
    yPct: 0,
    widthPct: 100,
    heightPct: 100,
  });
});


function fakeOcrCanvas(): HTMLCanvasElement {
  const context = {
    fillStyle: "",
    fillRect() {},
  };
  return {
    width: 0,
    height: 0,
    getContext: () => context,
  } as unknown as HTMLCanvasElement;
}

function resolvedRenderPage() {
  return {
    getViewport: ({ scale }: { scale: number }) => ({
      width: 100 * scale,
      height: 50 * scale,
    }),
    render: () => ({
      promise: Promise.resolve(),
      cancel() {},
    }),
  };
}

function successfulWorker(text = "Recovered text") {
  return {
    async setParameters() {},
    async recognize() {
      return {
        data: {
          text,
          confidence: 97,
          blocks: [],
        },
      };
    },
    async terminate() {},
  };
}

test("local OCR retries cleanly after worker startup fails", async () => {
  let attempts = 0;
  const engine = createLocalOcrEngine("https://lumeo.in", {
    createCanvas: fakeOcrCanvas,
    createWorker: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("worker startup failed");
      return successfulWorker();
    },
  });

  await assert.rejects(
    engine.recognizePage({ page: resolvedRenderPage() as never, pageIndex: 0 }),
    /worker startup failed/,
  );

  const result = await engine.recognizePage({
    page: resolvedRenderPage() as never,
    pageIndex: 0,
  });
  assert.equal(attempts, 2);
  assert.equal(result.text, "Recovered text");
  await engine.terminate();
});

test("local OCR discards a worker after recognition failure before retrying", async () => {
  let workersCreated = 0;
  let failedWorkerTerminated = 0;
  const engine = createLocalOcrEngine("https://lumeo.in", {
    createCanvas: fakeOcrCanvas,
    createWorker: async () => {
      workersCreated += 1;
      if (workersCreated === 1) {
        return {
          async setParameters() {},
          async recognize() {
            throw new Error("recognition failed");
          },
          async terminate() {
            failedWorkerTerminated += 1;
          },
        };
      }
      return successfulWorker("Second worker");
    },
  });

  await assert.rejects(
    engine.recognizePage({ page: resolvedRenderPage() as never, pageIndex: 0 }),
    /recognition failed/,
  );

  const result = await engine.recognizePage({
    page: resolvedRenderPage() as never,
    pageIndex: 0,
  });
  assert.equal(workersCreated, 2);
  assert.equal(failedWorkerTerminated, 1);
  assert.equal(result.text, "Second worker");
  await engine.terminate();
});

test("local OCR rejects overlapping recognition jobs in one engine", async () => {
  let rejectRecognition: ((error: Error) => void) | null = null;
  const engine = createLocalOcrEngine("https://lumeo.in", {
    createCanvas: fakeOcrCanvas,
    createWorker: async () => ({
      async setParameters() {},
      recognize() {
        return new Promise((_resolve, reject) => {
          rejectRecognition = reject;
        });
      },
      async terminate() {
        rejectRecognition?.(new Error("worker terminated"));
      },
    }),
  });

  const first = engine.recognizePage({
    page: resolvedRenderPage() as never,
    pageIndex: 0,
  });

  await assert.rejects(
    engine.recognizePage({ page: resolvedRenderPage() as never, pageIndex: 1 }),
    /already running/i,
  );

  await engine.terminate();
  await assert.rejects(first);
});

test("terminating local OCR cancels an in-progress page raster", async () => {
  let renderCancelled = false;
  let rejectRender: ((error: Error) => void) | null = null;
  const page = {
    getViewport: ({ scale }: { scale: number }) => ({
      width: 100 * scale,
      height: 50 * scale,
    }),
    render: () => ({
      promise: new Promise<void>((_resolve, reject) => {
        rejectRender = reject;
      }),
      cancel() {
        renderCancelled = true;
        rejectRender?.(new Error("render cancelled"));
      },
    }),
  };

  const engine = createLocalOcrEngine("https://lumeo.in", {
    createCanvas: fakeOcrCanvas,
    createWorker: async () => successfulWorker(),
  });

  const pending = engine.recognizePage({ page: page as never, pageIndex: 0 });
  await engine.terminate();

  assert.equal(renderCancelled, true);
  await assert.rejects(pending);
});
