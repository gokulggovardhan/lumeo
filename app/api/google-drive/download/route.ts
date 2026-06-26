import { NextRequest, NextResponse } from "next/server";
import { downloadDriveFileBuffer } from "@/lib/googleDriveServer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { fileId?: string };
    const fileId = typeof body.fileId === "string" ? body.fileId.trim() : "";

    if (!fileId) {
      return NextResponse.json(
        { success: false, error: "Missing file." },
        { status: 400 },
      );
    }

    const downloaded = await downloadDriveFileBuffer(fileId);
    const safeFileName = downloaded.fileName.replace(/["\r\n]/g, "");
    const fileBody = downloaded.bytes.buffer.slice(
      downloaded.bytes.byteOffset,
      downloaded.bytes.byteOffset + downloaded.bytes.byteLength,
    ) as ArrayBuffer;

    return new NextResponse(fileBody, {
      status: 200,
      headers: {
        "Content-Type": downloaded.mimeType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${safeFileName}"`,
        "X-Lumeo-File-Name": encodeURIComponent(downloaded.fileName),
        "X-Lumeo-File-Size": String(downloaded.size),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[Lumeo Media Sync] source download failed", error);

    return NextResponse.json(
      { success: false, error: "Download failed." },
      { status: 500 },
    );
  }
}
