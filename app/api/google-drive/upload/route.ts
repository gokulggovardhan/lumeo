import { NextRequest, NextResponse } from "next/server";
import { uploadVideoToDriveUploadsFolder } from "@/lib/googleDriveServer";

const MAX_VIDEO_SIZE_BYTES = 500 * 1024 * 1024;

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const projectId = formData.get("projectId");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "Missing video file." },
        { status: 400 },
      );
    }

    if (typeof projectId !== "string" || !projectId.trim()) {
      return NextResponse.json(
        { success: false, error: "Missing project ID." },
        { status: 400 },
      );
    }

    if (!file.type.startsWith("video/")) {
      return NextResponse.json(
        { success: false, error: "Only video files are allowed." },
        { status: 400 },
      );
    }

    if (file.size > MAX_VIDEO_SIZE_BYTES) {
      return NextResponse.json(
        { success: false, error: "Video file is too large." },
        { status: 413 },
      );
    }

    const safeFileName = createDriveFileName(projectId, file.name);
    const uploadedFile = await uploadVideoToDriveUploadsFolder({
      file,
      fileName: safeFileName,
    });

    return NextResponse.json({
      success: true,
      fileId: uploadedFile.fileId,
      fileName: uploadedFile.fileName,
      mimeType: uploadedFile.mimeType,
      size: uploadedFile.size,
    });
  } catch (error) {
    console.error("Google Drive upload route failed", error);

    return NextResponse.json(
      { success: false, error: "Google Drive upload failed." },
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
