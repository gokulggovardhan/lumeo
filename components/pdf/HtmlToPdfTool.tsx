"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import DOMPurify from "dompurify";
import { useAnalytics } from "@/components/analytics/AnalyticsProvider";
import { L2ActionArea, L2PrivacyNote } from "@/components/pdf/workspace/ToolWorkspace";
import {
  buildHtml2PdfOptions,
  getPageContentWidthPx,
  validateHtmlSource,
  type MarginPreset,
  type Orientation,
  type PageSize,
} from "@/lib/pdf/htmlToPdfOptions";
import { sanitizeFileStem } from "@/lib/pdf/sanitizeFileName";
import { shouldAttemptOnce } from "@/lib/analytics/state";

const GENERATE_TIMEOUT_MS = 30_000;

const TEMPLATES: Record<string, string> = {
  Blank: "<h1>Untitled document</h1>\n<p>Start typing here.</p>",
  Invoice: `<style>
  body { font-family: sans-serif; padding: 24px; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
</style>
<h1>Invoice #001</h1>
<p>Billed to: Customer Name</p>
<table>
  <tr><th>Item</th><th>Qty</th><th>Price</th></tr>
  <tr><td>Service</td><td>1</td><td>$100.00</td></tr>
</table>
<p><strong>Total: $100.00</strong></p>`,
  Letter: `<style>
  body { font-family: serif; padding: 40px; line-height: 1.6; }
</style>
<p>Dear Reader,</p>
<p>Write your letter content here.</p>
<p>Sincerely,<br/>Your name</p>`,
};

const DRAFT_STORAGE_KEY = "lumeo.html-to-pdf.draft";
const DRAFT_SAVE_DEBOUNCE_MS = 500;

type Draft = {
  source: string;
  pageSize: PageSize;
  orientation: Orientation;
  margin: MarginPreset;
  fileName: string;
};

function loadDraft(): Draft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Draft>;
    if (typeof parsed.source !== "string" || !parsed.source.trim()) return null;
    return {
      source: parsed.source,
      pageSize: parsed.pageSize === "letter" || parsed.pageSize === "legal" ? parsed.pageSize : "a4",
      orientation: parsed.orientation === "landscape" ? "landscape" : "portrait",
      margin: parsed.margin === "none" || parsed.margin === "wide" ? parsed.margin : "normal",
      fileName: typeof parsed.fileName === "string" && parsed.fileName.trim() ? parsed.fileName : "lumeo-document",
    };
  } catch {
    return null;
  }
}

function saveDraft(draft: Draft) {
  try {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Best-effort -- private browsing / storage-full failures are non-fatal.
  }
}

function ToolPanel({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-[var(--text-primary)]/14 bg-[var(--atelier-surface-2)]">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--text-primary)]/10 px-3 py-2">
        <span className="text-xs font-bold uppercase tracking-wide text-[var(--text-primary)]/60">{title}</span>
        {action}
      </div>
      <div className="min-h-0 flex-1 p-3">{children}</div>
    </div>
  );
}

async function runWithTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), GENERATE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

type ExportSurface = {
  host: HTMLDivElement;
  container: HTMLElement;
  contentWidthPx: number;
  contentHeightPx: number;
};

// html2canvas cannot reliably paint content that lives in a different
// document than the one calling it -- capturing an <iframe>'s contentDocument
// (the previous approach here) produced a correctly-sized but genuinely
// blank canvas every time, regardless of viewport/height settings, because
// the source element's realm differs from html2canvas's own. Rendering the
// user's HTML into a Shadow DOM subtree of the *same* document keeps
// html2canvas in a single realm (fixing that) while still isolating the
// user's own <style> rules from leaking onto the rest of the page.
function createExportSurface(html: string, widthPx: number): Promise<ExportSurface> {
  // Rendered in the app's own document (not a sandboxed iframe, see the note
  // above), so any <script> or event-handler attribute in the user's typed
  // HTML must be stripped before it ever touches the DOM -- otherwise it
  // would execute with this page's own origin privileges.
  const sanitizedHtml = DOMPurify.sanitize(html, {
    WHOLE_DOCUMENT: true,
    FORBID_TAGS: ["script", "iframe", "object", "embed"],
    FORBID_ATTR: ["srcdoc"],
  });
  const parsed = new DOMParser().parseFromString(sanitizedHtml, "text/html");
  const styleNodes = Array.from(parsed.querySelectorAll("style"));
  const bodyHtml = parsed.body?.innerHTML ?? "";

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.position = "fixed";
  host.style.top = "0";
  host.style.left = "-10000px";
  host.style.width = `${widthPx}px`;
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });
  styleNodes.forEach((style) => shadow.appendChild(style.cloneNode(true)));

  const container = document.createElement("div");
  container.style.width = `${widthPx}px`;
  container.style.background = "#ffffff";
  container.innerHTML = bodyHtml;
  shadow.appendChild(container);

  const images = Array.from(container.querySelectorAll("img"));
  const imagesReady = images.length
    ? Promise.race([
        Promise.all(
          images.map(
            (img) =>
              new Promise<void>((resolve) => {
                if (img.complete) {
                  resolve();
                  return;
                }
                img.addEventListener("load", () => resolve(), { once: true });
                img.addEventListener("error", () => resolve(), { once: true });
              }),
          ),
        ).then(() => undefined),
        new Promise<void>((resolve) => setTimeout(resolve, 4000)),
      ])
    : Promise.resolve();

  return imagesReady.then(() => ({
    host,
    container,
    contentWidthPx: widthPx,
    contentHeightPx: Math.max(container.scrollHeight, 1),
  }));
}

export default function HtmlToPdfTool() {
  const { availability, track } = useAnalytics();
  const openedTrackedRef = useRef(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const initialDraft = useMemo(() => loadDraft(), []);

  const [source, setSource] = useState(initialDraft?.source ?? TEMPLATES.Blank);
  const [preview, setPreview] = useState(initialDraft?.source ?? TEMPLATES.Blank);
  const [pageSize, setPageSize] = useState<PageSize>(initialDraft?.pageSize ?? "a4");
  const [orientation, setOrientation] = useState<Orientation>(initialDraft?.orientation ?? "portrait");
  const [margin, setMargin] = useState<MarginPreset>(initialDraft?.margin ?? "normal");
  const [fileName, setFileName] = useState(initialDraft?.fileName ?? "lumeo-document");
  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (!shouldAttemptOnce({ availability, alreadyAccepted: openedTrackedRef.current })) return;
    const result = track({ eventName: "tool_opened", toolSlug: "html-to-pdf" });
    if (result.accepted) {
      openedTrackedRef.current = true;
    }
  }, [availability, track]);

  useEffect(() => {
    const id = setTimeout(() => setPreview(source), 300);
    return () => clearTimeout(id);
  }, [source]);

  useEffect(() => {
    const id = setTimeout(() => {
      saveDraft({ source, pageSize, orientation, margin, fileName });
    }, DRAFT_SAVE_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [source, pageSize, orientation, margin, fileName]);

  const validationError = useMemo(() => validateHtmlSource(source), [source]);
  // vh/vw resolve against the real browser window during capture (the
  // off-screen host isn't a real viewport at the PDF's physical size), so
  // they silently scale wrong instead of erroring -- flagging it up front is
  // the only fix possible without a server-side print engine.
  const hasViewportUnits = useMemo(() => /\b\d+(\.\d+)?\s*(vh|vw)\b/i.test(source), [source]);
  const wordCount = useMemo(() => {
    const text = source.replace(/<[^>]*>/g, " ").trim();
    return text ? text.split(/\s+/).length : 0;
  }, [source]);

  function handleReset() {
    setSource(TEMPLATES.Blank);
    setError("");
  }

  async function handleGenerate() {
    const currentValidationError = validateHtmlSource(source);
    if (currentValidationError) {
      setError(currentValidationError);
      return;
    }

    setIsGenerating(true);
    setError("");
    const startedAt = performance.now();
    track({ eventName: "processing_started", toolSlug: "html-to-pdf" });

    let exportSurface: ExportSurface | null = null;
    try {
      const pageWidthPx = getPageContentWidthPx(pageSize, orientation);
      exportSurface = await createExportSurface(source, pageWidthPx);
      const surface = exportSurface;

      const html2pdf = (await import("html2pdf.js")).default;
      const options = buildHtml2PdfOptions({
        fileName: `${sanitizeFileStem(fileName, "lumeo-document")}.pdf`,
        pageSize,
        orientation,
        margin,
        contentWidthPx: surface.contentWidthPx,
        contentHeightPx: surface.contentHeightPx,
      });
      await runWithTimeout(
        html2pdf().set(options).from(surface.container).save(),
        "Generating the PDF took too long. Try simpler HTML/CSS or fewer images.",
      );

      track({
        eventName: "processing_succeeded",
        toolSlug: "html-to-pdf",
        durationMs: performance.now() - startedAt,
        success: true,
      });
    } catch (generateError) {
      setError(
        generateError instanceof Error
          ? generateError.message
          : "Could not generate the PDF. Check your HTML and try again.",
      );
      track({
        eventName: "processing_failed",
        toolSlug: "html-to-pdf",
        durationMs: performance.now() - startedAt,
        success: false,
        errorCode: "processing_error",
      });
    } finally {
      exportSurface?.host.remove();
      setIsGenerating(false);
    }
  }

  return (
    <section className="l2-tool-deep-workspace mx-auto grid w-full max-w-[1240px] gap-5 pb-4 lg:pb-0">
      <div className="grid gap-3 lg:h-[480px] lg:grid-cols-3">
        <ToolPanel
          title="HTML / CSS"
          action={
            <div className="flex flex-wrap items-center gap-1.5">
              {Object.keys(TEMPLATES).map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setSource(TEMPLATES[name])}
                  className="rounded-full border border-[var(--text-primary)]/14 px-2.5 py-1 text-xs font-bold text-[var(--text-primary)]"
                >
                  {name}
                </button>
              ))}
              <button
                type="button"
                onClick={handleReset}
                className="rounded-full border border-[var(--text-primary)]/14 px-2.5 py-1 text-xs font-bold text-[var(--text-primary)]"
              >
                Reset
              </button>
            </div>
          }
        >
          <div className="flex h-full flex-col gap-1.5">
            <textarea
              value={source}
              onChange={(event) => setSource(event.target.value)}
              spellCheck={false}
              aria-label="HTML and CSS source"
              className="min-h-[260px] w-full flex-1 resize-none rounded-lg border border-[var(--text-primary)]/14 bg-[var(--atelier-surface-1)] p-3 font-mono text-sm text-[var(--text-primary)]"
            />
            <p className="shrink-0 text-right text-xs font-semibold text-[var(--text-primary)]/40">
              {source.length.toLocaleString()} characters · {wordCount.toLocaleString()} words
            </p>
            {hasViewportUnits ? (
              <p role="status" className="shrink-0 rounded-lg border border-[var(--text-warning,#b45309)]/25 bg-[var(--text-warning,#b45309)]/10 px-3 py-2 text-xs font-medium text-[var(--text-warning,#b45309)]">
                vh/vw units don&apos;t map to the printed page size and can scale incorrectly. Use mm, px, or pt instead for reliable output.
              </p>
            ) : null}
          </div>
        </ToolPanel>

        <ToolPanel title="Live preview">
          <iframe
            ref={iframeRef}
            title="HTML preview"
            srcDoc={preview}
            sandbox="allow-same-origin"
            className="h-full w-full rounded-lg bg-white"
          />
        </ToolPanel>

        <ToolPanel title="Page settings">
          <div className="flex h-full flex-col gap-3 overflow-y-auto">
            <label className="grid gap-1 text-sm font-bold text-[var(--text-primary)]">
              File name
              <input
                value={fileName}
                onChange={(event) => setFileName(event.target.value)}
                className="rounded-lg border border-[var(--text-primary)]/14 px-3 py-2 text-sm"
              />
            </label>
            <label className="grid gap-1 text-sm font-bold text-[var(--text-primary)]">
              Page size
              <select value={pageSize} onChange={(event) => setPageSize(event.target.value as PageSize)} className="rounded-lg border border-[var(--text-primary)]/14 px-3 py-2 text-sm">
                <option value="a4">A4</option>
                <option value="letter">Letter</option>
                <option value="legal">Legal</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-bold text-[var(--text-primary)]">
              Orientation
              <select value={orientation} onChange={(event) => setOrientation(event.target.value as Orientation)} className="rounded-lg border border-[var(--text-primary)]/14 px-3 py-2 text-sm">
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-bold text-[var(--text-primary)]">
              Margin
              <select value={margin} onChange={(event) => setMargin(event.target.value as MarginPreset)} className="rounded-lg border border-[var(--text-primary)]/14 px-3 py-2 text-sm">
                <option value="none">None</option>
                <option value="normal">Normal</option>
                <option value="wide">Wide</option>
              </select>
            </label>

            <div className="mt-auto grid gap-3">
              <L2ActionArea
                primary={
                  <button
                    type="button"
                    onClick={() => void handleGenerate()}
                    disabled={isGenerating || Boolean(validationError)}
                    className="lumeo-primary-action lumeo-press inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius-md)] bg-[linear-gradient(180deg,var(--action-primary-hover),var(--action-primary-active))] px-6 py-3 text-sm font-extrabold text-[var(--text-on-accent)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isGenerating ? "Generating…" : "Generate PDF"}
                  </button>
                }
              />
              {error ? (
                <div role="alert" className="rounded-lg border border-[var(--text-danger)]/20 bg-[var(--text-danger)]/10 p-3 text-sm font-medium text-[var(--text-danger)]">
                  {error}
                </div>
              ) : null}
            </div>
          </div>
        </ToolPanel>
      </div>

      <L2PrivacyNote />
    </section>
  );
}
