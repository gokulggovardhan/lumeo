import { NextRequest, NextResponse } from "next/server";
import { deleteTemporaryCloudinaryVideo } from "@/lib/cloudinaryServer";
import {
  getDriveFolderMetadata,
  getGoogleDriveEnvPresence,
  GoogleDriveServerError,
  uploadVideoBufferToDriveUploadsFolder,
} from "@/lib/googleDriveServer";

export const dynamic = "force-dynamic";

type CopyFailedStage =
  | "requestRead"
  | "payloadValidation"
  | "tempMediaDownload"
  | "driveEnvCheck"
  | "driveTokenRefresh"
  | "driveUpload"
  | "tempCleanup"
  | "unknown";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  if (searchParams.get("diagnose") !== "true") {
    return NextResponse.json(
      {
        success: false,
        error: "Not found.",
      },
      { status: 404 },
    );
  }

  const token = searchParams.get("token");
  const expectedToken = process.env.LUMEO_ADMIN_CLEANUP_TOKEN;

  if (!expectedToken || token !== expectedToken) {
    return NextResponse.json(
      {
        success: false,
        diagnose: true,
        error: "Diagnostic authorization required.",
        failedStage: "auth",
        diagnostic: "Admin diagnostic token is missing or invalid.",
      },
      { status: 401 },
    );
  }

  const env = getGoogleDriveEnvPresence();
  const uploadsFolderId = process.env.LUMEO_DRIVE_UPLOADS_FOLDER_ID || "";
  let folder:
    | {
        ok: true;
        name: string;
        mimeType: string;
      }
    | {
        ok: false;
        diagnostic: string;
      };

  try {
    const metadata = await getDriveFolderMetadata(uploadsFolderId);
    folder = {
      ok: true,
      name: metadata.name,
      mimeType: "application/vnd.google-apps.folder",
    };
  } catch (error) {
    folder = {
      ok: false,
      diagnostic: getSafeErrorMessage(error),
    };
  }

  return NextResponse.json({
    success: true,
    diagnose: true,
    env,
    uploadsFolder: folder,
  });
}

export async function POST(request: NextRequest) {
  let failedStage: CopyFailedStage = "requestRead";
  let safeFileName = "";
  let safeSize = 0;
  let safeMimeType = "";
  let safeProjectId = "";

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
    safeMimeType = body.mimeType || "";
    safeProjectId = body.projectId || "";
    failedStage = "payloadValidation";

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
          failedStage,
          diagnostic: "Missing media metadata.",
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
          failedStage,
          diagnostic: "Only video files are allowed.",
          details: "Only video files are allowed.",
        },
        { status: 400 },
      );
    }

    failedStage = "tempMediaDownload";
    const secureUrl = new URL(body.secureUrl);

    if (secureUrl.protocol !== "https:") {
      return NextResponse.json(
        {
          success: false,
          error: "Cloud backup failed while saving. Please retry.",
          failedStage,
          diagnostic: "Invalid temporary media URL.",
          details: "Invalid temporary media URL.",
        },
        { status: 400 },
      );
    }

    console.info("[Lumeo Upload] copy to permanent storage started", {
      stage: "tempMediaDownload",
      fileName: body.fileName,
      size: body.size,
      mimeType: body.mimeType,
      projectId: body.projectId,
    });

    const mediaResponse = await fetch(secureUrl, {
      cache: "no-store",
    });

    if (!mediaResponse.ok) {
      console.error("[Lumeo Upload] temporary media download failed", {
        stage: "tempMediaDownload",
        status: mediaResponse.status,
        fileName: body.fileName,
        size: body.size,
        mimeType: body.mimeType,
        projectId: body.projectId,
      });

      return NextResponse.json(
        {
          success: false,
          error: "Cloud backup failed while saving. Please retry.",
          failedStage,
          diagnostic: `Temporary media download failed with status ${mediaResponse.status}.`,
          details: `Temporary media download failed with status ${mediaResponse.status}.`,
        },
        { status: 502 },
      );
    }

    const bytes = Buffer.from(await mediaResponse.arrayBuffer());
    failedStage = "driveUpload";
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
      stage: "driveUpload",
      fileName: uploadedFile.fileName,
      size: uploadedFile.size,
      mimeType: uploadedFile.mimeType,
      projectId: body.projectId,
    });

    let cleanupComplete = false;

    try {
      failedStage = "tempCleanup";
      console.info("[Lumeo Upload] temporary cleanup started", {
        stage: "tempCleanup",
        fileName: body.fileName,
        size: body.size,
        mimeType: body.mimeType,
        projectId: body.projectId,
      });

      await deleteTemporaryCloudinaryVideo(body.publicId);
      cleanupComplete = true;

      console.info("[Lumeo Upload] temporary cleanup completed", {
        stage: "tempCleanup",
        fileName: body.fileName,
        size: body.size,
        mimeType: body.mimeType,
        projectId: body.projectId,
      });
    } catch (cleanupError) {
      console.error("[Lumeo Upload] temporary cleanup failed", {
        stage: "tempCleanup",
        fileName: body.fileName,
        size: body.size,
        mimeType: body.mimeType,
        projectId: body.projectId,
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
    failedStage = getDriveFailedStage(error, failedStage);
    const unavailable = isCloudBackupUnavailable(error);
    const errorMessage = getSafeErrorMessage(error);

    console.error("Copy from Cloudinary route failed", {
      stage: failedStage,
      fileName: safeFileName,
      size: safeSize,
      mimeType: safeMimeType,
      projectId: safeProjectId,
      error,
    });

    return NextResponse.json(
      {
        success: false,
        error: unavailable
          ? "Cloud backup is temporarily unavailable."
          : "Cloud backup failed while saving. Please retry.",
        failedStage,
        diagnostic: errorMessage,
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

function getDriveFailedStage(
  error: unknown,
  fallback: CopyFailedStage,
): CopyFailedStage {
  if (!(error instanceof GoogleDriveServerError)) return fallback || "unknown";

  if (error.code.startsWith("missing_")) return "driveEnvCheck";
  if (
    error.code === "token_refresh_failed" ||
    error.code === "invalid_grant" ||
    error.code === "invalid_client" ||
    error.code === "unauthorized_client"
  ) {
    return "driveTokenRefresh";
  }

  if (
    error.code === "uploads_target_not_folder" ||
    error.code === "folder_lookup_failed" ||
    error.code.startsWith("drive_") ||
    error.code.includes("upload")
  ) {
    return "driveUpload";
  }

  return fallback || "unknown";
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
