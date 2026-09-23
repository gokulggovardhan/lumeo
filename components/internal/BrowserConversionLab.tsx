"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { ConversionCoordinator } from "@/lib/conversion/ConversionCoordinator";
import { BrowserPdfToWordEngine } from "@/lib/conversion/browser/BrowserPdfToWordEngine";
import { BrowserWordToPdfEngine } from "@/lib/conversion/browser/BrowserWordToPdfEngine";
import {
  canRunThreadedBrowserOffice,
  detectBrowserConversionCapabilities,
} from "@/lib/conversion/browser/capabilities";
import {
  BrowserLibreOfficeRuntime,
} from "@/lib/conversion/browser/libreoffice/BrowserLibreOfficeRuntime";
import {
  LUMEO_OFFICE_RUNTIME_ROUTE,
  resolveOfficeAssetConfig,
} from "@/lib/conversion/browser/libreoffice/assetConfig";
import { normalizeConversionError } from "@/lib/conversion/errors";
import type { ConversionResult } from "@/lib/conversion/types";

type LabState =
  | "idle"
  | "ready"
  | "converting"
  | "success"
  | "cancelled"
  | "error";

type WordRuntimeState = {
  baseUrl: string;
  runtime: BrowserLibreOfficeRuntime;
  coordinator: ConversionCoordinator;
};

const pdfCoordinator = new ConversionCoordinator(new BrowserPdfToWordEngine());

function useResultUrl(result: ConversionResult | null): string | null {
  const url = useMemo(
    () => (result ? URL.createObjectURL(result.blob) : null),
    [result],
  );

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  return url;
}

function LabResult({
  result,
  testId,
}: {
  result: ConversionResult | null;
  testId: string;
}) {
  const url = useResultUrl(result);
  if (!result || !url) return null;

  return (
    <a
      data-testid={testId}
      href={url}
      download={result.fileName}
      className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-center text-sm font-semibold text-emerald-200"
    >
      Download {result.fileName}
    </a>
  );
}

export default function BrowserConversionLab() {
  const [capabilitySummary, setCapabilitySummary] = useState(
    "Checking browser capabilities...",
  );
  const [runtimeBase, setRuntimeBase] = useState(LUMEO_OFFICE_RUNTIME_ROUTE);

  const [wordFile, setWordFile] = useState<File | null>(null);
  const [wordState, setWordState] = useState<LabState>("idle");
  const [wordMessage, setWordMessage] = useState("Select a DOC or DOCX sample.");
  const [wordResult, setWordResult] = useState<ConversionResult | null>(null);

  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfState, setPdfState] = useState<LabState>("idle");
  const [pdfMessage, setPdfMessage] = useState("Select a PDF sample.");
  const [pdfResult, setPdfResult] = useState<ConversionResult | null>(null);

  const wordAbortRef = useRef<AbortController | null>(null);
  const pdfAbortRef = useRef<AbortController | null>(null);
  const wordRuntimeRef = useRef<WordRuntimeState | null>(null);

  const capabilityText = useMemo(() => capabilitySummary, [capabilitySummary]);

  useEffect(() => {
    void detectBrowserConversionCapabilities().then((capabilities) => {
      setCapabilitySummary(
        [
          `WASM: ${capabilities.webAssembly ? "yes" : "no"}`,
          `Workers: ${capabilities.webWorkers ? "yes" : "no"}`,
          `SharedArrayBuffer: ${capabilities.sharedArrayBuffer ? "yes" : "no"}`,
          `crossOriginIsolated: ${capabilities.crossOriginIsolated ? "yes" : "no"}`,
          `OPFS: ${capabilities.opfs ? "yes" : "no"}`,
          `Threads ready: ${capabilities.wasmThreadsReady ? "yes" : "no"}`,
          `Worker WebGL: ${capabilities.workerOffscreenWebGl ? "yes" : "no"}`,
          `Office runtime ready: ${canRunThreadedBrowserOffice(capabilities) ? "yes" : "no"}`,
        ].join(" · "),
      );
    });
  }, []);

  useEffect(() => {
    return () => {
      wordAbortRef.current?.abort();
      pdfAbortRef.current?.abort();
      wordRuntimeRef.current?.runtime.destroy();
      wordRuntimeRef.current = null;
    };
  }, []);

  function wordCoordinator(): ConversionCoordinator {
    const normalizedBase = new URL(
      runtimeBase.trim(),
      window.location.origin,
    ).toString();
    const current = wordRuntimeRef.current;

    if (current?.baseUrl === normalizedBase) {
      return current.coordinator;
    }

    current?.runtime.destroy();

    const runtime = new BrowserLibreOfficeRuntime(
      resolveOfficeAssetConfig("development", normalizedBase),
    );
    const coordinator = new ConversionCoordinator(
      new BrowserWordToPdfEngine(runtime),
    );
    wordRuntimeRef.current = {
      baseUrl: normalizedBase,
      runtime,
      coordinator,
    };
    return coordinator;
  }

  async function convertWord() {
    if (!wordFile || wordState === "converting") return;

    const controller = new AbortController();
    wordAbortRef.current?.abort();
    wordAbortRef.current = controller;
    setWordResult(null);
    setWordState("converting");
    setWordMessage("Preparing document");

    try {
      const result = await wordCoordinator().convert(
        { file: wordFile },
        {
          onProgress: ({ message }) => setWordMessage(message),
        },
        controller.signal,
      );
      setWordResult(result);
      setWordState("success");
      setWordMessage("Ready to download");
    } catch (error) {
      const normalized = normalizeConversionError(error);
      if (normalized.code === "cancelled" || controller.signal.aborted) {
        setWordState("cancelled");
        setWordMessage("Conversion cancelled");
      } else {
        setWordState("error");
        setWordMessage(normalized.message);
      }
    } finally {
      if (wordAbortRef.current === controller) wordAbortRef.current = null;
    }
  }

  async function convertPdf() {
    if (!pdfFile || pdfState === "converting") return;

    const controller = new AbortController();
    pdfAbortRef.current?.abort();
    pdfAbortRef.current = controller;
    setPdfResult(null);
    setPdfState("converting");
    setPdfMessage("Preparing document");

    try {
      const result = await pdfCoordinator.convert(
        { file: pdfFile },
        {
          onProgress: ({ message }) => setPdfMessage(message),
        },
        controller.signal,
      );
      setPdfResult(result);
      setPdfState("success");
      setPdfMessage("Ready to download");
    } catch (error) {
      const normalized = normalizeConversionError(error);
      if (normalized.code === "cancelled" || controller.signal.aborted) {
        setPdfState("cancelled");
        setPdfMessage("Conversion cancelled");
      } else {
        setPdfState("error");
        setPdfMessage(normalized.message);
      }
    } finally {
      if (pdfAbortRef.current === controller) pdfAbortRef.current = null;
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-5 py-8 sm:px-6 sm:py-10">
      <div className="rounded-3xl border border-white/10 bg-black/30 p-5 shadow-2xl sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-300">
          Development only
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-white">
          Browser conversion validation lab
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/70">
          This route exercises the same Word → PDF and PDF → Word browser
          engines used by the public tools. Production remains gated separately.
        </p>

        <div
          data-testid="capabilities"
          className="mt-5 rounded-2xl bg-white/5 p-4 text-xs leading-5 text-white/60"
        >
          {capabilityText}
        </div>

        <label className="mt-5 grid gap-2 text-xs font-semibold text-white/70">
          Development Office runtime base
          <input
            data-testid="runtime-base"
            value={runtimeBase}
            onChange={(event) => {
              setRuntimeBase(event.target.value);
              wordRuntimeRef.current?.runtime.destroy();
              wordRuntimeRef.current = null;
            }}
            className="min-w-0 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-normal text-white"
          />
        </label>

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <section
            data-testid="word-lab"
            data-state={wordState}
            className="grid content-start gap-4 rounded-2xl border border-white/10 bg-white/[0.035] p-4"
          >
            <div>
              <h2 className="text-lg font-semibold text-white">Word → PDF</h2>
              <p className="mt-1 text-xs leading-5 text-white/55">
                Actual BrowserWordToPdfEngine with an injectable development
                LibreOffice runtime.
              </p>
            </div>

            <input
              data-testid="word-input"
              type="file"
              accept=".doc,.docx"
              onChange={(event) => {
                setWordFile(event.target.files?.[0] ?? null);
                setWordResult(null);
                setWordState(event.target.files?.[0] ? "ready" : "idle");
                setWordMessage(
                  event.target.files?.[0]
                    ? "File selected"
                    : "Select a DOC or DOCX sample.",
                );
              }}
              className="block w-full min-w-0 rounded-xl border border-white/15 bg-white/5 p-3 text-sm text-white"
            />

            <div className="flex flex-wrap gap-2">
              <button
                data-testid="word-convert"
                type="button"
                onClick={convertWord}
                disabled={!runtimeBase || !wordFile || wordState === "converting"}
                className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-50"
              >
                Convert
              </button>
              <button
                data-testid="word-cancel"
                type="button"
                onClick={() => wordAbortRef.current?.abort()}
                disabled={wordState !== "converting"}
                className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-35"
              >
                Cancel
              </button>
            </div>

            <p
              data-testid="word-status"
              aria-live="polite"
              className="text-sm text-white/70"
            >
              {wordMessage}
            </p>

            <LabResult result={wordResult} testId="word-download" />
          </section>

          <section
            data-testid="pdf-lab"
            data-state={pdfState}
            className="grid content-start gap-4 rounded-2xl border border-white/10 bg-white/[0.035] p-4"
          >
            <div>
              <h2 className="text-lg font-semibold text-white">PDF → Word</h2>
              <p className="mt-1 text-xs leading-5 text-white/55">
                Actual BrowserPdfToWordEngine with editable reconstruction and
                fidelity backgrounds.
              </p>
            </div>

            <input
              data-testid="pdf-input"
              type="file"
              accept=".pdf,application/pdf"
              onChange={(event) => {
                setPdfFile(event.target.files?.[0] ?? null);
                setPdfResult(null);
                setPdfState(event.target.files?.[0] ? "ready" : "idle");
                setPdfMessage(
                  event.target.files?.[0]
                    ? "File selected"
                    : "Select a PDF sample.",
                );
              }}
              className="block w-full min-w-0 rounded-xl border border-white/15 bg-white/5 p-3 text-sm text-white"
            />

            <div className="flex flex-wrap gap-2">
              <button
                data-testid="pdf-convert"
                type="button"
                onClick={convertPdf}
                disabled={!pdfFile || pdfState === "converting"}
                className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-50"
              >
                Convert
              </button>
              <button
                data-testid="pdf-cancel"
                type="button"
                onClick={() => pdfAbortRef.current?.abort()}
                disabled={pdfState !== "converting"}
                className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-35"
              >
                Cancel
              </button>
            </div>

            <p
              data-testid="pdf-status"
              aria-live="polite"
              className="text-sm text-white/70"
            >
              {pdfMessage}
            </p>

            <LabResult result={pdfResult} testId="pdf-download" />
          </section>
        </div>
      </div>

      <canvas id="qtcanvas" className="hidden" aria-hidden="true" />
    </main>
  );
}
