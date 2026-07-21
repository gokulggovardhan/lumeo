import { NextResponse, type NextRequest } from "next/server";
import { convertWordToPdf, WordToPdfConversionError } from "@/lib/converters/word-to-pdf";
import { createStorageServerClient } from "@/lib/supabase/storageServerClient";
import { WORD_TO_PDF_BUCKET, WORD_UPLOAD_PATH_PATTERN } from "@/lib/supabase/wordToPdfStorage";
import { sanitizeFileStem } from "@/lib/pdf/sanitizeFileName";

// LibreOffice conversion needs a real Node process (child_process, fs) and
// can run past the edge runtime's execution budget, so this route stays on
// the Node runtime backed by the Docker function image (Dockerfile.vercel).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function trimmed(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

async function deleteUpload(supabase: ReturnType<typeof createStorageServerClient>, path: string) {
  const { error } = await supabase.storage.from(WORD_TO_PDF_BUCKET).remove([path]);
  if (error) {
    console.error("word-to-pdf: failed to delete temp upload:", error.message);
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

  if (!/\.(docx?|DOCX?)$/.test(fileName)) {
    return NextResponse.json({ ok: false, message: "Only .docx and .doc files are supported." }, { status: 400 });
  }

  // Never fetch a URL supplied by the client -- that's an SSRF vector (a
  // request could point the server at an internal/metadata endpoint instead
  // of Supabase). Only accept a path in the exact shape this feature's own
  // upload helper generates, then derive the signed URL ourselves.
  if (!WORD_UPLOAD_PATH_PATTERN.test(filePathInSupabase)) {
    return NextResponse.json({ ok: false, message: "Invalid upload reference." }, { status: 400 });
  }

  const supabase = createStorageServerClient();
  const { data: signedData, error: signedError } = await supabase.storage
    .from(WORD_TO_PDF_BUCKET)
    .createSignedUrl(filePathInSupabase, 60);

  if (signedError || !signedData?.signedUrl) {
    return NextResponse.json({ ok: false, message: "Uploaded file could not be located." }, { status: 400 });
  }

  try {
    const { buffer, fileName: outputName } = await convertWordToPdf({ fileUrl: signedData.signedUrl, fileName });
    const downloadName = `${sanitizeFileStem(outputName, "converted")}.pdf`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${downloadName}"`,
        "Content-Length": String(buffer.byteLength),
      },
    });
  } catch (conversionError) {
    const message =
      conversionError instanceof WordToPdfConversionError
        ? conversionError.message
        : "Conversion failed. Please try again.";
    console.error("word-to-pdf conversion failed:", conversionError);
    return NextResponse.json({ ok: false, message }, { status: 502 });
  } finally {
    await deleteUpload(supabase, filePathInSupabase);
  }
}
