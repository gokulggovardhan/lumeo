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
  signedUrl: string;
};

// Uploads under a random UUID prefix so two concurrent uploads (or a user
// re-uploading the same filename) never collide in the shared bucket.
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

  const { data: signedData, error: signedError } = await supabase.storage
    .from(WORD_TO_PDF_BUCKET)
    .createSignedUrl(path, 300);

  if (signedError || !signedData?.signedUrl) {
    await supabase.storage.from(WORD_TO_PDF_BUCKET).remove([path]);
    throw new Error("Could not prepare the uploaded file for conversion.");
  }

  return { path, signedUrl: signedData.signedUrl };
}

export async function removeWordUpload(path: string): Promise<void> {
  const supabase = createClient();
  await supabase.storage.from(WORD_TO_PDF_BUCKET).remove([path]);
}
