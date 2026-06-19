import { NextRequest, NextResponse } from "next/server";
import { deleteTemporaryCloudinaryVideo } from "@/lib/cloudinaryServer";
import { uploadVideoBufferToDriveUploadsFolder } from "@/lib/googleDriveServer";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      publicId?: string;
      secureUrl?: string;
      fileName?: string;
      mimeType?: string;
      size?: number;
      projectId?: string;
    };

    if (
      !body.publicId ||
      !body.secureUrl ||
      !body.fileName ||
      !body.mimeType ||
      !body.projectId ||
      !Number.isFinite(body.size)
    ) {
      return NextResponse.json(
        { success: false, error: "Missing media metadata." },
        { status: 400 },
      );
    }

    if (!body.mimeType.startsWith("video/")) {
      return NextResponse.json(
        { success: false, error: "Only video files are allowed." },
        { status: 400 },
      );
    }

    const secureUrl = new URL(body.secureUrl);

    if (secureUrl.protocol !== "https:") {
      return NextResponse.json(
        { success: false, error: "Invalid media URL." },
        { status: 400 },
      );
    }

    console.info("[Lumeo Upload] copy to permanent storage started", {
      publicId: body.publicId,
      fileName: body.fileName,
      size: body.size,
      projectId: body.projectId,
    });

    const mediaResponse = await fetch(secureUrl, {
      cache: "no-store",
    });

    if (!mediaResponse.ok) {
      console.error("[Lumeo Upload] temporary media download failed", {
        status: mediaResponse.status,
      });

      return NextResponse.json(
        { success: false, error: "Media copy failed." },
        { status: 502 },
      );
    }

    const bytes = Buffer.from(await mediaResponse.arrayBuffer());
    const uploadedFile = await uploadVideoBufferToDriveUploadsFolder({
      bytes,
      fileName: createDriveFileName(body.projectId, body.fileName),
      mimeType: body.mimeType,
      size: Number(body.size),
    });

    console.info("[Lumeo Upload] copy to permanent storage completed", {
      fileName: uploadedFile.fileName,
      size: uploadedFile.size,
    });

    let cleanupComplete = false;

    try {
      console.info("[Lumeo Upload] temporary cleanup started", {
        publicId: body.publicId,
      });

      await deleteTemporaryCloudinaryVideo(body.publicId);
      cleanupComplete = true;

      console.info("[Lumeo Upload] temporary cleanup completed", {
        publicId: body.publicId,
      });
    } catch (cleanupError) {
      console.error("[Lumeo Upload] temporary cleanup failed", cleanupError);
    }

    return NextResponse.json({
      success: true,
      cleanupComplete,
      fileId: uploadedFile.fileId,
      fileName: uploadedFile.fileName,
      mimeType: uploadedFile.mimeType,
      size: uploadedFile.size,
    });
  } catch (error) {
    console.error("Copy from Cloudinary route failed", error);

    return NextResponse.json(
      { success: false, error: "Media copy failed." },
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
  return (
    value
      .trim()
      .replace(/[/\\?%*:|"<>]/g, "-")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 160) || "file"
  );
}
