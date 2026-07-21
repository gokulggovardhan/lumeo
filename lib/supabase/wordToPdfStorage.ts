import { createClient } from "@/lib/supabase/client";

// Vercel's Docker functions reject request bodies over 4.5MB, so the
// Next.js API route never receives the .docx directly -- the browser
// uploads straight to this bucket and the route only ever sees a
// short-lived signed URL + storage path.
export const WORD_TO_PDF_BUCKET = "lumeo-temp";

export const MAX_WORD_FILE_SIZE_BYTES = 45 * 1024 * 1024;

export function isWordNamedFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".docx") ||
    name.endsWith(".doc") ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.type === "application/msword"
  );
}

export function checkWordFileSize(file: File): string | null {
  if (file.size > MAX_WORD_FILE_SIZE_BYTES) {
    return `This file is too large. The limit is ${Math.round(MAX_WORD_FILE_SIZE_BYTES / (1024 * 1024))} MB.`;
  }
  return null;
}

export type WordUploadResult = {
  path: string;
};

// Matches the path format this module generates -- a bare UUID plus
// extension, nothing else. The API route re-checks this server-side before
// trusting a client-supplied path (see app/api/tools/word-to-pdf/route.ts),
// so keep the shape here and there in sync.
export const WORD_UPLOAD_PATH_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.docx?$/i;

// Uploads under a random UUID prefix so two concurrent uploads (or a user
// re-uploading the same filename) never collide in the shared bucket. The
// API route derives its own signed URL from this path server-side -- it
// never fetches a URL supplied by the client, which would be an SSRF vector.
export async function uploadWordFileForConversion(file: File): Promise<WordUploadResult> {
  const supabase = createClient();
  const extension = file.name.toLowerCase().endsWith(".doc") ? "doc" : "docx";
  const path = `${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(WORD_TO_PDF_BUCKET)
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) {
    throw new Error("Upload to secure storage failed. Please try again.");
  }

  return { path };
}

export async function removeWordUpload(path: string): Promise<void> {
  const supabase = createClient();
  await supabase.storage.from(WORD_TO_PDF_BUCKET).remove([path]);
}
