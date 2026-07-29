import { createStorageBrowserClient } from "@/lib/supabase/storageBrowserClient";
import { isPdfNamedFile } from "@/lib/pdf/uploadValidation";

export { isPdfNamedFile };

// Same scratch bucket as Word->PDF -- both are short-lived, deleted right
// after conversion, no reason to fragment storage per tool direction.
export const PDF_TO_WORD_BUCKET = "lumeo-temp";

// Temporary cap, well below the 45MB the pipeline can technically accept.
// The converter runs on Render's free tier (512MB RAM, 0.1 CPU): measured
// live, a ~2.3MB image-heavy PDF OOM-crashed the whole container (Render
// auto-restarted it), while a ~1MB image-heavy PDF converted fine in ~60s.
// 1.5MB keeps real margin below the confirmed-safe point. Raise this once
// the converter is on a plan with more memory headroom.
export const MAX_PDF_FILE_SIZE_BYTES = 1.5 * 1024 * 1024;

// Storage uploads can fail transiently (a dropped connection, a Supabase
// 5xx, a rate-limit blip). Retry the transient ones a couple of times with a
// short linear backoff before giving up, rather than ending the whole flow
// on one hiccup.
const UPLOAD_MAX_ATTEMPTS = 3;
const UPLOAD_RETRY_BASE_MS = 400;

export function checkPdfFileSize(file: File): string | null {
  if (file.size > MAX_PDF_FILE_SIZE_BYTES) {
    const limitMb = (MAX_PDF_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(1);
    return `This file is too large. Our free converter is temporarily capped at ${limitMb} MB while we add more capacity -- try a smaller file for now.`;
  }
  return null;
}

export type PdfUploadResult = {
  path: string;
};

// Matches the path format this module generates -- a bare UUID plus ".pdf",
// nothing else. The API route re-checks this server-side before trusting a
// client-supplied path (see app/api/tools/pdf-to-word/route.ts), so keep the
// shape here and there in sync.
export const PDF_UPLOAD_PATH_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/i;

type UploadFailure = { status?: number; statusCode?: string; message?: string };

function failureStatus(error: UploadFailure): number | undefined {
  const status = error.status ?? (error.statusCode ? Number(error.statusCode) : undefined);
  return status !== undefined && !Number.isNaN(status) ? status : undefined;
}

// Retry only failures a second attempt could plausibly clear: network drops
// (no status), rate limits (429), and server errors (5xx). A 4xx like 413
// (too large) or a MIME rejection is permanent -- retrying just wastes time.
function isTransientFailure(error: UploadFailure): boolean {
  const status = failureStatus(error);
  if (status === undefined) return true;
  if (status === 429) return true;
  return status >= 500;
}

// Turn a raw storage failure into one actionable sentence for the UI. The
// real error is always logged separately (see below) for diagnosis.
function uploadFailureMessage(error: UploadFailure): string {
  const raw = (error.message ?? "").toLowerCase();
  const status = failureStatus(error);

  if (status === 413 || /maximum allowed size|payload too large|entity too large/.test(raw)) {
    return "This file is too large to upload. Try a smaller document.";
  }
  if (/mime type|not supported/.test(raw)) {
    return "This file type can't be uploaded. Use a .pdf file.";
  }
  if (/quota|storage limit|exceeded/.test(raw)) {
    return "Storage is temporarily unavailable. Please try again shortly.";
  }
  return "Upload to secure storage failed. Please check your connection and try again.";
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Uploads under a random UUID name so two concurrent uploads (or a user
// re-uploading the same filename) never collide in the shared bucket. The
// API route derives its own signed URL from this path server-side -- it
// never fetches a URL supplied by the client, which would be an SSRF vector.
export async function uploadPdfFileForConversion(file: File): Promise<PdfUploadResult> {
  const supabase = createStorageBrowserClient();
  const contentType = file.type || "application/pdf";

  let lastFailure: UploadFailure = {};

  for (let attempt = 1; attempt <= UPLOAD_MAX_ATTEMPTS; attempt += 1) {
    // A fresh UUID per attempt: if a prior attempt half-wrote the object
    // before failing, reusing its path with upsert:false would 409.
    const path = `${crypto.randomUUID()}.pdf`;

    try {
      const { error } = await supabase.storage
        .from(PDF_TO_WORD_BUCKET)
        .upload(path, file, { contentType, upsert: false });

      if (!error) return { path };
      lastFailure = error as UploadFailure;
    } catch (thrown) {
      // Hard network errors reject rather than resolving with { error }.
      lastFailure = { message: thrown instanceof Error ? thrown.message : "Network error" };
    }

    console.error(
      `PDF to Word upload attempt ${attempt}/${UPLOAD_MAX_ATTEMPTS} failed:`,
      lastFailure,
    );

    if (attempt < UPLOAD_MAX_ATTEMPTS && isTransientFailure(lastFailure)) {
      await wait(UPLOAD_RETRY_BASE_MS * attempt);
      continue;
    }
    break;
  }

  throw new Error(uploadFailureMessage(lastFailure));
}

export async function removePdfUpload(path: string): Promise<void> {
  const supabase = createStorageBrowserClient();
  await supabase.storage.from(PDF_TO_WORD_BUCKET).remove([path]);
}
