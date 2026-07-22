import { NextResponse, type NextRequest } from "next/server";
import {
  convertPdfToWord,
  PdfToWordConversionError,
} from "@/lib/converters/pdf-to-word";
import { warmConverter } from "@/lib/converters/word-to-pdf";
import { createStorageServerClient } from "@/lib/supabase/storageServerClient";
import { PDF_TO_WORD_BUCKET, PDF_UPLOAD_PATH_PATTERN } from "@/lib/supabase/pdfToWordStorage";
import { sanitizeFileStem } from "@/lib/pdf/sanitizeFileName";

// This route brokers the conversion: it talks to the external LibreOffice
// service (see lib/converters/pdf-to-word.ts) over HTTP. It stays on the
// Node runtime (not edge) so the fetch budget and env access behave like a
// normal server, and raises maxDuration so a cold-start conversion isn't
// hard-killed before the converter answers.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Fired by the client the moment a file is selected -- wakes the (possibly
// asleep) converter during the user's think-time so the real POST is fast.
// Same converter service as word-to-pdf, so this shares its warm-up call.
export async function GET() {
  await warmConverter();
  return new NextResponse(null, { status: 204 });
}

function trimmed(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

async function deleteUpload(supabase: ReturnType<typeof createStorageServerClient>, path: string) {
  const { error } = await supabase.storage.from(PDF_TO_WORD_BUCKET).remove([path]);
  if (error) {
    console.error("pdf-to-word: failed to delete temp upload:", error.message);
  }
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid request." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, message: "Invalid request." }, { status: 400 });
  }

  const data = body as Record<string, unknown>;
  const fileName = trimmed(data.fileName, 255);
  const filePathInSupabase = trimmed(data.filePathInSupabase, 255);

  if (!fileName || !filePathInSupabase) {
    return NextResponse.json(
      { ok: false, message: "Missing fileName or filePathInSupabase." },
      { status: 400 },
    );
  }

  if (!/\.pdf$/i.test(fileName)) {
    return NextResponse.json({ ok: false, message: "Only .pdf files are supported." }, { status: 400 });
  }

  // Never fetch a URL supplied by the client -- that's an SSRF vector (a
  // request could point the server at an internal/metadata endpoint instead
  // of Supabase). Only accept a path in the exact shape this feature's own
  // upload helper generates, then derive the signed URL ourselves.
  if (!PDF_UPLOAD_PATH_PATTERN.test(filePathInSupabase)) {
    return NextResponse.json({ ok: false, message: "Invalid upload reference." }, { status: 400 });
  }

  const supabase = createStorageServerClient();
  const { data: signedData, error: signedError } = await supabase.storage
    .from(PDF_TO_WORD_BUCKET)
    .createSignedUrl(filePathInSupabase, 60);

  if (signedError || !signedData?.signedUrl) {
    return NextResponse.json({ ok: false, message: "Uploaded file could not be located." }, { status: 400 });
  }

  try {
    const { buffer, fileName: outputName } = await convertPdfToWord({
      fileUrl: signedData.signedUrl,
      fileName,
    });
    const downloadName = `${sanitizeFileStem(outputName, "converted")}.docx`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${downloadName}"`,
        "Content-Length": String(buffer.byteLength),
      },
    });
  } catch (conversionError) {
    const message =
      conversionError instanceof PdfToWordConversionError
        ? conversionError.message
        : "Conversion failed. Please try again.";
    console.error("pdf-to-word conversion failed:", conversionError);
    return NextResponse.json({ ok: false, message }, { status: 502 });
  } finally {
    await deleteUpload(supabase, filePathInSupabase);
  }
}
