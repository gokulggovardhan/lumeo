"use client";

import { useEffect, useMemo, useState } from "react";

import {
  getLibreOfficePrototypeRuntime,
  LIBREOFFICE_PROTOTYPE_MAX_FILE_BYTES,
} from "@/lib/conversion/browser/libreoffice/prototypeRuntime";
import { detectBrowserConversionCapabilities } from "@/lib/conversion/browser/capabilities";

type LabStatus = "idle" | "loading" | "ready" | "converting" | "success" | "error";

export default function BrowserConversionLab() {
  const [status, setStatus] = useState<LabStatus>("idle");
  const [message, setMessage] = useState("Select a small DOC/DOCX/ODT sample.");
  const [file, setFile] = useState<File | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [capabilitySummary, setCapabilitySummary] = useState("Checking browser capabilities...");

  const maxLabel = useMemo(
    () => `${Math.round(LIBREOFFICE_PROTOTYPE_MAX_FILE_BYTES / 1024 / 1024)} MB`,
    [],
  );

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
        ].join(" · "),
      );
    });
  }, []);

  useEffect(() => {
    return () => {
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, [resultUrl]);

  async function warmRuntime() {
    setStatus("loading");
    setMessage("Loading LibreOffice WebAssembly locally in this browser...");
    try {
      await getLibreOfficePrototypeRuntime().start();
      setStatus("ready");
      setMessage("LibreOffice browser runtime is ready.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Runtime failed to start.");
    }
  }

  async function convert() {
    if (!file) return;

    if (resultUrl) {
      URL.revokeObjectURL(resultUrl);
      setResultUrl(null);
    }

    setStatus("converting");
    setMessage("Opening document and exporting PDF inside this browser...");

    try {
      const result = await getLibreOfficePrototypeRuntime().convert(file);
      const url = URL.createObjectURL(result.blob);
      setResultUrl(url);
      setStatus("success");
      setMessage(`Converted locally: ${result.fileName}`);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Conversion failed.");
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="rounded-3xl border border-white/10 bg-black/30 p-6 shadow-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-300">
          Development only
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-white">
          Browser LibreOffice conversion lab
        </h1>
        <p className="mt-3 text-sm leading-6 text-white/70">
          This route exists only to prove DOC/DOCX/ODT → PDF through LibreOffice
          WebAssembly. It is not the public Word → PDF tool and it is intentionally
          capped at {maxLabel} while the large-file filesystem path is evaluated.
        </p>

        <div className="mt-5 rounded-2xl bg-white/5 p-4 text-xs leading-5 text-white/60">
          {capabilitySummary}
        </div>

        <div className="mt-6 flex flex-col gap-4">
          <button
            type="button"
            onClick={warmRuntime}
            disabled={status === "loading" || status === "converting"}
            className="rounded-xl border border-white/15 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            Load browser office runtime
          </button>

          <input
            type="file"
            accept=".doc,.docx,.odt"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setStatus("idle");
              setMessage("Sample selected. Start local conversion when ready.");
            }}
            className="block w-full rounded-xl border border-white/15 bg-white/5 p-3 text-sm text-white"
          />

          <button
            type="button"
            onClick={convert}
            disabled={!file || status === "loading" || status === "converting"}
            className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black disabled:opacity-50"
          >
            Convert locally to PDF
          </button>

          <p aria-live="polite" className="text-sm text-white/70">
            {message}
          </p>

          {resultUrl ? (
            <a
              href={resultUrl}
              download={file ? `${file.name.replace(/\.[^.]+$/, "")}.pdf` : "converted.pdf"}
              className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-center text-sm font-semibold text-emerald-200"
            >
              Download prototype PDF
            </a>
          ) : null}
        </div>

        <canvas id="qtcanvas" className="hidden" aria-hidden="true" />
      </div>
    </main>
  );
}
