import { NextResponse, type NextRequest } from "next/server";
import { createStorageServerClient } from "@/lib/supabase/storageServerClient";
import { WORD_TO_PDF_BUCKET } from "@/lib/supabase/wordToPdfStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Backstop sweep for orphaned uploads. The normal flow deletes the temp
// .docx on both the client and the API route the instant a conversion
// finishes (or fails), so an orphan only survives an abnormal exit -- e.g.
// the tab closing after the upload but before the convert request lands.
// This cron mops those up so the shared bucket can't slowly fill.
//
// A legit conversion completes in well under a minute, so anything older
// than this cutoff is definitively abandoned and safe to remove.
const STALE_CUTOFF_MS = 2 * 60 * 60 * 1000; // 2 hours
const LIST_LIMIT = 1000;

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  // Fail closed: without a configured secret we cannot authenticate the
  // caller, so refuse rather than expose an unauthenticated delete endpoint.
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, message: "Unauthorized." }, { status: 401 });
  }

  const supabase = createStorageServerClient();
  const { data, error } = await supabase.storage
    .from(WORD_TO_PDF_BUCKET)
    .list("", { limit: LIST_LIMIT, sortBy: { column: "created_at", order: "asc" } });

  if (error) {
    console.error("word-to-pdf cleanup: list failed:", error.message);
    return NextResponse.json({ ok: false, message: "List failed." }, { status: 502 });
  }

  const cutoff = Date.now() - STALE_CUTOFF_MS;
  const stale = data
    .filter((object) => {
      const createdAt = object.created_at ? Date.parse(object.created_at) : Number.NaN;
      // No timestamp -> treat as stale (it can't be an in-flight upload).
      return Number.isNaN(createdAt) || createdAt < cutoff;
    })
    .map((object) => object.name);

  if (stale.length === 0) {
    return NextResponse.json({ ok: true, scanned: data.length, removed: 0 });
  }

  const { error: removeError } = await supabase.storage.from(WORD_TO_PDF_BUCKET).remove(stale);
  if (removeError) {
    console.error("word-to-pdf cleanup: remove failed:", removeError.message);
    return NextResponse.json({ ok: false, message: "Remove failed." }, { status: 502 });
  }

  return NextResponse.json({ ok: true, scanned: data.length, removed: stale.length });
}
