"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Camera, Download, ShieldCheck, Image as ImageIcon } from "lucide-react";
import { AuraButton } from "@/components/ui/Aura";
import { L2UploadStage } from "@/components/pdf/workspace/ToolWorkspace";
import { useAnalytics } from "@/components/analytics/AnalyticsProvider";
import { shouldAttemptOnce } from "@/lib/analytics/state";
import { groupPhotos, PHOTO_ACCEPT, releasePhotoUrls, runPhotoQueue, type PhotoAsset, type PhotoStatus } from "@/lib/heic-to-jpeg/pipeline";
import { convertPhoto, type PhotoResult } from "@/lib/heic-to-jpeg/worker-client";

type Row = PhotoAsset<File> & { status: PhotoStatus; message?: string; result?: PhotoResult; url?: string };
const labels: Record<PhotoStatus, string> = { queued: "Ready", inspecting: "Inspecting", decoding: "Decoding", processing: "Preparing pixels", encoding: "Creating JPEG", done: "Done", failed: "Failed", "needs-review": "Needs review" };
const size = (bytes: number) => bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export default function HeicToJpegTool() {
  const [rows, setRows] = useState<Row[]>([]);
  const [quality, setQuality] = useState(92);
  const [busy, setBusy] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [notice, setNotice] = useState("");
  const controller = useRef<AbortController | null>(null);
  const urls = useRef(new Set<string>());
  const opened = useRef(false);
  const mounted = useRef(false);
  const { availability, track } = useAnalytics();
  useEffect(() => {
    if (!shouldAttemptOnce({ availability, alreadyAccepted: opened.current })) return;
    const result = track({ eventName: "tool_opened", toolSlug: "heic-to-jpeg" });
    if (result.accepted) opened.current = true;
  }, [availability, track]);
  useEffect(() => {
    mounted.current = true;
    const ownedUrls = urls.current;
    return () => { mounted.current = false; controller.current?.abort(); releasePhotoUrls(ownedUrls); ownedUrls.clear(); };
  }, []);

  function reset() {
    controller.current?.abort(); controller.current = null;
    releasePhotoUrls(urls.current); urls.current.clear();
    setRows([]); setBusy(false); setNotice("");
  }
  function select(files: FileList | readonly File[]) {
    if (controller.current || zipping) return;
    reset();
    const snapshot = Array.from(files);\n    const { assets, ignored } = groupPhotos(snapshot);
    setRows(assets.map((asset) => ({ ...asset, status: asset.source ? "queued" : "needs-review" })));
    setNotice([ignored ? `${ignored} macOS housekeeping file(s) ignored.` : "", assets.length > 50 ? "Large batches take time and retain completed JPEGs in browser memory. For high-resolution photos, smaller batches work best." : ""].filter(Boolean).join(" "));
  }
  function update(id: string, patch: Partial<Row>) { setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row)); }
  async function convert() {
    if (controller.current) return;
    const pending = rows.filter((row) => row.source && row.status === "queued");
    if (!pending.length) return;
    const run = new AbortController(); controller.current = run; setBusy(true);
    const started = performance.now();
    track({ eventName: "processing_started", toolSlug: "heic-to-jpeg" });
    let failures = 0;
    const concurrency = navigator.hardwareConcurrency >= 8 && window.innerWidth >= 1024 ? 2 : 1;
    await runPhotoQueue(pending, concurrency, async (row) => {
      const result = await convertPhoto(row.source!, row.companions, quality, (status) => { if (!run.signal.aborted) update(row.id, { status }); }, run.signal);
      if (run.signal.aborted) return;
      const url = URL.createObjectURL(result.blob); urls.current.add(url);
      update(row.id, { status: "done", result, url });
    }, (row, error) => { failures++; update(row.id, { status: "failed", message: error instanceof Error ? error.message : "This photo could not be converted." }); }, run.signal);
    if (run.signal.aborted) return;
    controller.current = null; setBusy(false);
    const durationMs = Math.round(performance.now() - started);
    if (failures) track({ eventName: "processing_failed", toolSlug: "heic-to-jpeg", durationMs, success: false, errorCode: "processing_error" });
    else track({ eventName: "processing_succeeded", toolSlug: "heic-to-jpeg", durationMs, success: true });
  }
  function download(url: string, name: string) {
    const a = document.createElement("a"); a.href = url; a.download = name;
    document.body.append(a); a.click(); a.remove();
    track({ eventName: "download_started", toolSlug: "heic-to-jpeg" });
  }
  async function downloadAll() {
    if (zipping) return;
    setZipping(true); setNotice("");
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      for (const row of rows) if (row.result) zip.file(row.outputName, row.result.blob);
      const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
      if (!mounted.current) return;
      const url = URL.createObjectURL(blob); urls.current.add(url);
      download(url, "lumeo-heic-to-jpeg.zip");
      // Keep the URL through the browser's download handoff; reset/unmount also owns cleanup.
      setTimeout(() => { URL.revokeObjectURL(url); urls.current.delete(url); }, 60_000);
    } catch { if (mounted.current) setNotice("The download bundle could not be created. Download the completed JPEGs individually."); }
    finally { if (mounted.current) setZipping(false); }
  }
  const summary = useMemo(() => {
    const counts: Record<PhotoStatus, number> = { queued: 0, inspecting: 0, decoding: 0, processing: 0, encoding: 0, done: 0, failed: 0, "needs-review": 0 };
    const done: Row[] = [];
    const photos: Row[] = [];
    for (const row of rows) {
      counts[row.status] += 1;
      if (row.status === "done") done.push(row);
      if (row.source) photos.push(row);
    }
    return { counts, done, photos, completed: counts.done + counts.failed, outputBytes: done.reduce((total, row) => total + (row.result?.blob.size ?? 0), 0) };
  }, [rows]);
  const failedCount = summary.counts.failed;
  const queuedCount = summary.counts.queued;
  return <div className="mt-6 space-y-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
    {!rows.length ? <L2UploadStage inputId="heic-photo-upload" title="Drop iPhone photos here" description="Choose photos and their companion files together" acceptedNote="HEIC, HEIF and JPEG. Apple companions are recognized; ProRAW is not converted." accept={PHOTO_ACCEPT} multiple buttonLabel="Choose photos" icon={<Camera aria-hidden="true" size={28} />} onFilesSelected={select} /> : <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><h2 className="text-xl font-semibold">{summary.photos.length} photo{summary.photos.length === 1 ? "" : "s"} detected</h2><p className="mt-1 text-sm text-[var(--text-secondary)]">Companions are grouped conservatively. Original files are unchanged.</p></div>
        <AuraButton type="button" variant="secondary" disabled={zipping} onClick={reset}>{busy ? "Cancel and start new" : "Start new"}</AuraButton>
      </div>
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <ul className="min-w-0 space-y-3" aria-label="Photo assets">
          {rows.map((row, index) => <li key={row.id} data-photo-asset data-logical-asset={row.id.split(":")[0]} data-status={row.status} data-output-dimensions={row.result ? `${row.result.width}x${row.result.height}` : ""} data-output-name={row.result ? row.outputName : ""} data-warning={row.message ?? row.warning ?? ""} className="min-w-0 rounded-lg bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-sm)]" style={{ contentVisibility: "auto", containIntrinsicSize: "88px" }}>
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[var(--surface-base)]">
                {row.url && index < 12 ? <Image unoptimized src={row.url} width={56} height={56} alt="Converted photo preview" className="h-full w-full object-contain" /> : <ImageIcon aria-hidden="true" className="text-[var(--text-accent)]" />}
              </div>
              <div className="min-w-0 flex-1"><h3 className="break-all font-semibold">{row.name}</h3><p className="mt-1 text-sm text-[var(--text-secondary)]">{row.source ? size(row.source.size) : "Companion / unsupported file"}{row.result ? ` → ${size(row.result.blob.size)} JPEG · ${row.result.width} × ${row.result.height}` : ""}</p>
                <p className="mt-2 text-sm font-medium">{labels[row.status]}{row.companions.length && row.source ? " · Companion detected" : ""}{row.result?.evidence.live === "confirmed" ? " · Live Photo confirmed" : row.result?.evidence.live === "probable" ? " · Possible Live Photo" : ""}{row.result?.evidence.hdr ? " · HDR evidence" : ""}{row.result?.evidence.depth ? " · Portrait data" : ""}</p>
              </div>
            </div>
            {row.warning || row.message ? <p className="mt-3 text-sm text-[var(--text-warning)]">{row.message ?? row.warning}</p> : null}
            {row.companions.length || row.result?.evidence.notices.length ? <details className="mt-3 text-sm text-[var(--text-secondary)]"><summary className="min-h-11 cursor-pointer py-2 focus-visible:outline">Photo details</summary><ul className="space-y-2 break-words">{row.companions.map((file, i) => <li key={i}>{file.name}</li>)}{row.result?.evidence.notices.map((text) => <li key={text}>{text}</li>)}{row.result?.evidence.adjustmentFormat ? <li>Edit format: {row.result.evidence.adjustmentFormat} {row.result.evidence.adjustmentVersion}</li> : null}</ul></details> : null}
            {row.url ? <AuraButton type="button" variant="secondary" className="mt-3 w-full sm:w-auto" onClick={() => download(row.url!, row.outputName)}><Download size={16} aria-hidden="true" />Download JPEG</AuraButton> : null}
          </li>)}
        </ul>
        <aside className="h-fit space-y-4 rounded-lg bg-[var(--surface-raised)] p-5 lg:sticky lg:top-24">
          <h2 className="text-lg font-semibold">JPEG output</h2>
          <label htmlFor="heic-quality" className="block text-sm font-semibold">Quality</label>
          <select id="heic-quality" value={quality} disabled={busy || summary.done.length > 0} onChange={(e) => setQuality(Number(e.target.value))} className="min-h-11 w-full rounded-md bg-[var(--surface-input)] px-3 text-base focus-visible:outline-2 focus-visible:outline-[var(--border-focus)]"><option value={92}>High · 92</option><option value={96}>Maximum · 96</option></select>
          <p className="text-sm leading-6 text-[var(--text-secondary)]">Converts the selected still. Apple sidecar edits, motion, depth and HDR reconstruction are not applied. JPEG exports omit location and camera metadata.</p>
          {busy ? <div role="status" className="space-y-2"><p>{summary.completed} of {summary.photos.length} processed</p><p className="text-xs text-[var(--text-muted)]">{summary.counts.inspecting} inspecting · {summary.counts.decoding} decoding · {summary.counts.processing} processing · {summary.counts.encoding} encoding</p><progress aria-label="Photos processed" className="h-2 w-full accent-[var(--action-primary)]" max={summary.photos.length || 1} value={summary.completed} /></div> : null}
          {queuedCount > 0 ? <AuraButton type="button" className="w-full" onClick={() => void convert()} loading={busy}>Convert to JPEG</AuraButton> : null}
          {!busy && summary.done.length > 1 ? <AuraButton type="button" className="w-full" loading={zipping} onClick={() => void downloadAll()}>Download all ({summary.done.length})</AuraButton> : null}
          {!busy && summary.done.length === 1 ? <AuraButton type="button" className="w-full" onClick={() => download(summary.done[0].url!, summary.done[0].outputName)}>Download JPEG</AuraButton> : null}
          {!busy && summary.outputBytes > 256 * 1024 * 1024 ? <p className="text-sm text-[var(--text-warning)]">This download bundle is large. Individual downloads may use less memory on iPhone.</p> : null}
        </aside>
      </div>
    </>}
    <div aria-live="polite" aria-atomic="true" className="text-sm text-[var(--text-secondary)]">{notice || (!busy && (summary.done.length || failedCount) ? `${summary.done.length} converted${failedCount ? `, ${failedCount} failed. Successful photos are available to download.` : ". Ready to download."}` : "")}</div>
    <p className="flex items-center justify-center gap-2 text-center text-sm leading-6 text-[var(--text-secondary)]"><ShieldCheck size={18} aria-hidden="true" />Your photos are processed in your browser. They are not uploaded for conversion.</p>
  </div>;
}
