import { NextRequest, NextResponse } from "next/server";
import { deleteTemporaryCloudinaryVideo } from "@/lib/cloudinaryServer";
import {
  GoogleDriveServerError,
  uploadVideoBufferToDriveUploadsFolder,
} from "@/lib/googleDriveServer";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let failedStage = "requestRead";
  let safeFileName = "";
  let safeSize = 0;

  try {
    const body = (await request.json()) as {
      publicId?: string;
      secureUrl?: string;
      fileName?: string;
      mimeType?: string;
      size?: number;
      projectId?: string;
    };
    safeFileName = body.fileName || "";
    safeSize = Number(body.size || 0);

    if (
      !body.publicId ||
      !body.secureUrl ||
      !body.fileName ||
      !body.mimeType ||
      !body.projectId ||
      !Number.isFinite(body.size)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Cloud backup failed while saving. Please retry.",
          failedStage: "requestRead",
          details: "Missing media metadata.",
        },
        { status: 400 },
      );
    }

    if (!body.mimeType.startsWith("video/")) {
      return NextResponse.json(
        {
          success: false,
          error: "Cloud backup failed while saving. Please retry.",
          failedStage: "requestRead",
          details: "Only video files are allowed.",
        },
        { status: 400 },
      );
    }

    failedStage = "temporaryDownload";
    const secureUrl = new URL(body.secureUrl);

    if (secureUrl.protocol !== "https:") {
      return NextResponse.json(
        {
          success: false,
          error: "Cloud backup failed while saving. Please retry.",
          failedStage,
          details: "Invalid temporary media URL.",
        },
        { status: 400 },
      );
    }

    console.info("[Lumeo Upload] copy to permanent storage started", {
      stage: "temporaryDownload",
      fileName: body.fileName,
      size: body.size,
      projectId: body.projectId,
    });

    const mediaResponse = await fetch(secureUrl, {
      cache: "no-store",
    });

    if (!mediaResponse.ok) {
      console.error("[Lumeo Upload] temporary media download failed", {
        stage: "temporaryDownload",
        status: mediaResponse.status,
        fileName: body.fileName,
        size: body.size,
      });

      return NextResponse.json(
        {
          success: false,
          error: "Cloud backup failed while saving. Please retry.",
          failedStage,
          details: `Temporary media download failed with status ${mediaResponse.status}.`,
        },
        { status: 502 },
      );
    }

    const bytes = Buffer.from(await mediaResponse.arrayBuffer());
    failedStage = "permanentSave";
    const uploadedFile = await uploadVideoBufferToDriveUploadsFolder({
      bytes,
      fileName: createDriveFileName(body.projectId, body.fileName),
      mimeType: body.mimeType,
      size: Number(body.size),
      appProperties: {
        projectId: body.projectId,
        purpose: "source",
        app: "lumeo",
        uploadedAt: new Date().toISOString(),
      },
    });

    console.info("[Lumeo Upload] copy to permanent storage completed", {
      stage: "permanentSave",
      fileName: uploadedFile.fileName,
      size: uploadedFile.size,
    });

    let cleanupComplete = false;

    try {
      console.info("[Lumeo Upload] temporary cleanup started", {
        stage: "temporaryCleanup",
        fileName: body.fileName,
        size: body.size,
      });

      await deleteTemporaryCloudinaryVideo(body.publicId);
      cleanupComplete = true;

      console.info("[Lumeo Upload] temporary cleanup completed", {
        stage: "temporaryCleanup",
        fileName: body.fileName,
        size: body.size,
      });
    } catch (cleanupError) {
      console.error("[Lumeo Upload] temporary cleanup failed", {
        stage: "temporaryCleanup",
        fileName: body.fileName,
        size: body.size,
        error: cleanupError,
      });
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
    const unavailable = isCloudBackupUnavailable(error);
    const errorMessage = getSafeErrorMessage(error);

    console.error("Copy from Cloudinary route failed", {
      stage: failedStage,
      fileName: safeFileName,
      size: safeSize,
      error,
    });

    return NextResponse.json(
      {
        success: false,
        error: unavailable
          ? "Cloud backup is temporarily unavailable."
          : "Cloud backup failed while saving. Please retry.",
        failedStage: unavailable ? "cloudBackupUnavailable" : failedStage,
        details: errorMessage,
      },
      { status: unavailable ? 503 : 500 },
    );
  }
}

function isCloudBackupUnavailable(error: unknown) {
  if (!(error instanceof GoogleDriveServerError)) return false;

  return (
    error.code.startsWith("missing_") ||
    error.code === "token_refresh_failed" ||
    error.code === "uploads_target_not_folder" ||
    error.code === "drive_401" ||
    error.code === "drive_403" ||
    error.code === "drive_404"
  );
}

function getSafeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 180) : "Unknown error.";
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
