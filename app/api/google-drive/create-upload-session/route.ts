import { NextRequest, NextResponse } from "next/server";
import { createVideoUploadSession } from "@/lib/googleDriveServer";

const MAX_VIDEO_SIZE_BYTES = 500 * 1024 * 1024;

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      fileName?: string;
      mimeType?: string;
      size?: number;
      projectId?: string;
    };

    if (!body.fileName || !body.mimeType || !body.projectId) {
      return NextResponse.json(
        { success: false, error: "Missing upload metadata." },
        { status: 400 },
      );
    }

    if (!body.mimeType.startsWith("video/")) {
      return NextResponse.json(
        { success: false, error: "Only video files are allowed." },
        { status: 400 },
      );
    }

    if (!Number.isFinite(body.size) || Number(body.size) <= 0) {
      return NextResponse.json(
        { success: false, error: "Invalid video file size." },
        { status: 400 },
      );
    }

    if (Number(body.size) > MAX_VIDEO_SIZE_BYTES) {
      return NextResponse.json(
        { success: false, error: "Video file is too large." },
        { status: 413 },
      );
    }

    const fileName = createDriveFileName(body.projectId, body.fileName);
    const session = await createVideoUploadSession({
      fileName,
      mimeType: body.mimeType,
      size: Number(body.size),
    });

    return NextResponse.json({
      success: true,
      uploadUrl: session.uploadUrl,
      fileName: session.fileName,
    });
  } catch (error) {
    console.error("Google Drive upload session route failed", error);

    return NextResponse.json(
      { success: false, error: "Upload failed." },
      { status: 500 },
    );
  }
}

function createDriveFileName(projectId: string, originalFileName: string) {
  const safeProjectId = sanitizeFileSegment(projectId);
  const safeOriginalFileName = sanitizeFileSegment(originalFileName);

  return `lumeo-${safeProjectId}-${Date.now()}-${safeOriginalFileName}`;
}

function sanitizeFileSegment(value: string) {
  return value
    .trim()
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 160) || "file";
}
