"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { useAnalytics } from "@/components/analytics/AnalyticsProvider";
import {
  L2ActionArea,
  L2PrivacyNote,
  L2ToolMainColumn,
  L2ToolSettingsPanel,
  L2ToolWorkspace,
} from "@/components/pdf/workspace/ToolWorkspace";
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

  const [source, setSource] = useState(TEMPLATES.Blank);
  const [preview, setPreview] = useState(TEMPLATES.Blank);
  const [pageSize, setPageSize] = useState<PageSize>("a4");
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const [margin, setMargin] = useState<MarginPreset>("normal");
  const [fileName, setFileName] = useState("lumeo-document");
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

  const validationError = useMemo(() => validateHtmlSource(source), [source]);

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
    <section className="l2-tool-deep-workspace pb-4 lg:pb-0">
      <L2ToolWorkspace>
        <L2ToolMainColumn>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="grid gap-2">
              <div className="flex flex-wrap gap-2">
                {Object.keys(TEMPLATES).map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setSource(TEMPLATES[name])}
                    className="rounded-full border border-[var(--text-primary)]/14 px-3 py-1 text-xs font-bold text-[var(--text-primary)]"
                  >
                    {name}
                  </button>
                ))}
              </div>
              <textarea
                value={source}
                onChange={(event) => setSource(event.target.value)}
                spellCheck={false}
                aria-label="HTML and CSS source"
                className="min-h-[380px] w-full rounded-xl border border-[var(--text-primary)]/14 bg-[var(--atelier-surface-2)] p-3 font-mono text-sm text-[var(--text-primary)]"
              />
            </div>
            <div className="rounded-xl border border-[var(--text-primary)]/14 bg-white">
              <iframe
                ref={iframeRef}
                title="HTML preview"
                srcDoc={preview}
                sandbox="allow-same-origin"
                className="h-[380px] w-full rounded-xl"
              />
            </div>
          </div>
        </L2ToolMainColumn>

        <L2ToolSettingsPanel title="Page settings" description="Applied when the PDF is generated.">
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
        </L2ToolSettingsPanel>
      </L2ToolWorkspace>

      <L2PrivacyNote />
    </section>
  );
}
