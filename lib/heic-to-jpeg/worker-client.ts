import type { PhotoEvidence, PhotoStatus } from "./pipeline.ts";
export type PhotoResult = {
  blob: Blob;
  width: number;
  height: number;
  primaryWidth: number;
  primaryHeight: number;
  decodedWidth: number;
  decodedHeight: number;
  evidence: PhotoEvidence;
};

export function convertPhoto(source: File, companions: File[], quality: number, status: (value: PhotoStatus) => void, signal: AbortSignal): Promise<PhotoResult> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error("Cancelled")); return; }
    // One isolated WASM heap per job, with at most two active jobs. Termination releases all decoder memory.
    const worker = new Worker(new URL("./photo.worker.ts", import.meta.url), { type: "module" });
    let settled = false;
    const finish = () => {
      if (settled) return false;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
      return true;
    };
    const abort = () => { if (finish()) reject(new Error("Cancelled")); };
    const timer = setTimeout(() => { if (finish()) reject(new Error("Conversion timed out. Try a smaller export or fewer photos.")); }, 120_000);
    signal.addEventListener("abort", abort, { once: true });
    worker.onerror = () => { if (finish()) reject(new Error("The photo engine could not start or ran out of memory. Update your browser and try one photo.")); };
    worker.onmessage = ({ data }: MessageEvent<PhotoResult & { status: PhotoStatus; message?: string }>) => {
      if (data.status === "done") { if (finish()) resolve(data); }
      else if (data.status === "failed") { if (finish()) reject(new Error(data.message ?? "Conversion failed.")); }
      else status(data.status);
    };
    try { worker.postMessage({ source, companions, quality }); }
    catch { if (finish()) reject(new Error("The photo engine could not receive this file. Try selecting it again.")); }
  });
}
