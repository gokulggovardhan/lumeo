import { NextResponse, type NextRequest } from "next/server";
import {
  cleanupWordToPdfUploads,
  WordToPdfCleanupError,
} from "@/lib/supabase/wordToPdfCleanup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  // Fail closed: without a configured secret we cannot authenticate a
  // manual caller, so refuse rather than expose a destructive endpoint.
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, message: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await cleanupWordToPdfUploads();

    console.info("word-to-pdf cleanup completed", {
      source: "manual",
      ...result,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof WordToPdfCleanupError) {
      console.error("word-to-pdf cleanup failed", {
        source: "manual",
        stage: error.stage,
        message: error.message,
      });

      return NextResponse.json(
        {
          ok: false,
          message: error.stage === "list" ? "List failed." : "Remove failed.",
        },
        { status: 502 },
      );
    }

    console.error("word-to-pdf cleanup failed", {
      source: "manual",
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ ok: false, message: "Cleanup failed." }, { status: 502 });
  }
}
