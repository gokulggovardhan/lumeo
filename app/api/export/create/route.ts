import { NextRequest, NextResponse } from "next/server";
import {
  createPhaseOneCloudinaryExportUrl,
  deleteTemporaryCloudinaryVideo,
  uploadTemporaryCloudinaryVideoBuffer,
} from "@/lib/cloudinaryServer";
import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";
import {
  createDriveDownloadUrl,
  downloadDriveFileBuffer,
  uploadVideoBufferToDriveExportsFolder,
} from "@/lib/googleDriveServer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

type CanvasFormat = "9:16" | "1:1" | "16:9";
type ExportResolution = "720p" | "1080p";
type FitMode = "contain" | "cover";
type ExportFps = 30;
type ExportFailureStage =
  | "unknown"
  | "projectRead"
  | "mediaFileIdCheck"
  | "settingsResolve"
  | "sourceDownload"
  | "tempRenderUpload"
  | "transformationBuild"
  | "transformedFetch"
  | "permanentExportUpload"
  | "downloadUrlCreate"
  | "metadataSave"
  | "tempCleanup";

type ExportRequestBody = {
  projectId?: string;
  settings?: {
    trimStart?: number;
    trimEnd?: number;
    canvasFormat?: CanvasFormat;
    fitMode?:
      | FitMode
      | "fit"
      | "fill"
      | "fullFrame"
      | "originalView"
      | "Full Frame"
      | "Original View";
    resolution?: ExportResolution | "2k";
    fps?: number;
  };
};

type ProjectData = {
  title?: string;
  editor?: {
    media?: {
      storage?: {
        fileId?: string;
        fileName?: string;
        mimeType?: string;
        size?: number;
      } | null;
      videoDuration?: number;
    };
    trim?: {
      start?: number;
      end?: number;
    };
    canvas?: {
      format?: CanvasFormat;
      fitMode?:
        | FitMode
        | "fit"
        | "fill"
        | "fullFrame"
        | "originalView"
        | "Full Frame"
        | "Original View";
    };
    exportSettings?: {
      resolution?: ExportResolution | "2k";
      fps?: number;
    };
  };
};

export async function POST(request: NextRequest) {
  let temporaryPublicId = "";
  let failedStage: ExportFailureStage = "unknown";

  try {
    const body = (await request.json()) as ExportRequestBody;
    const projectId = typeof body.projectId === "string" ? body.projectId : "";

    if (!projectId) {
      return NextResponse.json(
        {
          success: false,
          error: "Export failed. Please try again.",
          failedStage: "projectRead",
          details: getSafeFailureDetails("projectRead"),
        },
        { status: 400 },
      );
    }

    console.info("[Lumeo Export] phase one export started", { projectId });

    failedStage = "projectRead";
    const db = getFirebaseAdminDb();
    const projectRef = db.collection("projects").doc(projectId);
    const snapshot = await projectRef.get();

    if (!snapshot.exists) {
      return NextResponse.json(
        {
          success: false,
          error: "Export failed. Please try again.",
          failedStage: "projectRead",
          details: getSafeFailureDetails("projectRead"),
        },
        { status: 404 },
      );
    }

    const project = snapshot.data() as ProjectData;
    failedStage = "mediaFileIdCheck";
    const sourceFileId = project.editor?.media?.storage?.fileId;

    if (!sourceFileId) {
      return NextResponse.json(
        {
          success: false,
          error: "Export failed. Please try again.",
          failedStage: "mediaFileIdCheck",
          details: getSafeFailureDetails("mediaFileIdCheck"),
        },
        { status: 400 },
      );
    }

    failedStage = "settingsResolve";
    const settings = resolveExportSettings(project, body.settings);
    const dimensions = getOutputDimensions(settings.canvasFormat, settings.resolution);
    console.info("[Lumeo Export] resolved export settings", {
      resolution: settings.resolution,
      fps: settings.fps,
      canvasFormat: settings.canvasFormat,
      frameMode: settings.fitMode,
      outputWidth: dimensions.width,
      outputHeight: dimensions.height,
    });

    failedStage = "sourceDownload";
    console.info("[Lumeo Export] source download started", { projectId });
    const source = await downloadDriveFileBuffer(sourceFileId);
    console.info("[Lumeo Export] source download completed", {
      fileName: source.fileName,
      size: source.size,
      mimeType: source.mimeType,
    });

    failedStage = "tempRenderUpload";
    console.info("[Lumeo Export] temporary transform source upload started", {
      projectId,
    });
    const temporarySource = await uploadTemporaryCloudinaryVideoBuffer({
      bytes: source.bytes,
      fileName: source.fileName,
    });
    temporaryPublicId = temporarySource.publicId;
    console.info("[Lumeo Export] temporary transform source upload completed", {
      publicId: temporaryPublicId,
      bytes: temporarySource.bytes,
    });

    failedStage = "transformationBuild";
    const transformedUrl = createPhaseOneCloudinaryExportUrl(temporaryPublicId, {
      trimStart: settings.trimStart,
      trimEnd: settings.trimEnd,
      width: dimensions.width,
      height: dimensions.height,
      fitMode: settings.fitMode,
      fps: settings.fps,
    });

    failedStage = "transformedFetch";
    const exportBytes = await fetchTransformedExportWithRetry(transformedUrl);
    console.info("[Lumeo Export] transformed MP4 fetch completed", {
      size: exportBytes.byteLength,
    });

    const createdAt = new Date().toISOString();
    const fileName = createExportFileName(project.title, projectId, settings);

    failedStage = "permanentExportUpload";
    console.info("[Lumeo Export] permanent export upload started", {
      projectId,
      fileName,
      size: exportBytes.byteLength,
    });
    const uploadedExport = await uploadVideoBufferToDriveExportsFolder({
      bytes: exportBytes,
      fileName,
      mimeType: "video/mp4",
      size: exportBytes.byteLength,
      appProperties: {
        projectId,
        purpose: "export",
        app: "lumeo",
        uploadedAt: createdAt,
      },
    });
    console.info("[Lumeo Export] permanent export upload completed", {
      fileName: uploadedExport.fileName,
      size: uploadedExport.size,
    });

    failedStage = "downloadUrlCreate";
    const downloadUrl = await createDriveDownloadUrl(uploadedExport.fileId);

    failedStage = "metadataSave";
    let metadataSaved = true;
    const exportMetadata = createExportMetadata({
      fileId: uploadedExport.fileId,
      fileName: uploadedExport.fileName,
      size: uploadedExport.size,
      createdAt,
      settings,
      dimensions,
    });

    try {
      await projectRef.update({
        "editor.export": exportMetadata,
        updatedAt: createdAt,
      });

      console.info("[Lumeo Export] project export metadata saved", { projectId });
    } catch (metadataError) {
      metadataSaved = false;
      console.error("[Lumeo Export] project export metadata save failed", {
        projectId,
        error: metadataError,
      });
    }

    failedStage = "tempCleanup";
    try {
      console.info("[Lumeo Export] temporary cleanup started", {
        publicId: temporaryPublicId,
      });
      await deleteTemporaryCloudinaryVideo(temporaryPublicId);
      console.info("[Lumeo Export] temporary cleanup completed", {
        publicId: temporaryPublicId,
      });
    } catch (cleanupError) {
      console.error("[Lumeo Export] temporary cleanup failed", cleanupError);
    }

    return NextResponse.json({
      success: true,
      downloadUrl,
      fileName: uploadedExport.fileName,
      createdAt,
      metadataSaved,
    });
  } catch (error) {
    console.error("[Lumeo Export] phase one export failed", {
      failedStage,
      error,
    });

    if (temporaryPublicId) {
      try {
        await deleteTemporaryCloudinaryVideo(temporaryPublicId);
      } catch (cleanupError) {
        console.error("[Lumeo Export] failed export cleanup failed", cleanupError);
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: "Export failed. Please try again.",
        failedStage,
        details: getSafeFailureDetails(failedStage),
      },
      { status: 500 },
    );
  }
}

function resolveExportSettings(
  project: ProjectData,
  bodySettings: ExportRequestBody["settings"],
) {
  const trimStart = toSafeNumber(
    bodySettings?.trimStart,
    project.editor?.trim?.start || 0,
  );
  const fallbackTrimEnd =
    project.editor?.trim?.end || project.editor?.media?.videoDuration || 0;
  const trimEnd = toSafeNumber(bodySettings?.trimEnd, fallbackTrimEnd);
  const canvasFormat = normalizeCanvasFormat(
    bodySettings?.canvasFormat || project.editor?.canvas?.format,
  );
  const fitMode = normalizeFitMode(
    bodySettings?.fitMode || project.editor?.canvas?.fitMode,
  );
  const resolution = normalizeResolution(
    bodySettings?.resolution || project.editor?.exportSettings?.resolution,
  );
  const fps = normalizeFps(
    resolution,
    bodySettings?.fps || project.editor?.exportSettings?.fps,
  );

  return {
    trimStart,
    trimEnd:
      trimEnd > 0 && trimEnd > trimStart
        ? trimEnd
        : project.editor?.media?.videoDuration || undefined,
    canvasFormat,
    fitMode,
    resolution,
    fps,
  };
}

function getOutputDimensions(
  canvasFormat: CanvasFormat,
  resolution: ExportResolution,
) {
  if (canvasFormat === "9:16") {
    return resolution === "1080p"
      ? { width: 1080, height: 1920 }
      : { width: 720, height: 1280 };
  }

  if (canvasFormat === "1:1") {
    return resolution === "1080p"
      ? { width: 1080, height: 1080 }
      : { width: 720, height: 720 };
  }

  return resolution === "1080p"
    ? { width: 1920, height: 1080 }
    : { width: 1280, height: 720 };
}

function normalizeCanvasFormat(value: unknown): CanvasFormat {
  return value === "1:1" || value === "16:9" ? value : "9:16";
}

function normalizeFitMode(value: unknown): FitMode {
  if (
    value === "contain" ||
    value === "fit" ||
    value === "Original View" ||
    value === "originalView"
  ) {
    return "contain";
  }

  return "cover";
}

function normalizeResolution(value: unknown): ExportResolution {
  return value === "1080p" ? "1080p" : "720p";
}

function normalizeFps(
  resolution: ExportResolution,
  value: unknown,
): ExportFps {
  return 30;
}

function createExportMetadata({
  fileId,
  fileName,
  size,
  createdAt,
  settings,
  dimensions,
}: {
  fileId: string;
  fileName: string;
  size: number;
  createdAt: string;
  settings: ReturnType<typeof resolveExportSettings>;
  dimensions: ReturnType<typeof getOutputDimensions>;
}) {
  return {
    status: "complete",
    fileId,
    fileName,
    mimeType: "video/mp4",
    size: Number.isFinite(Number(size)) ? Number(size) : 0,
    createdAt,
    settings: {
      format: "mp4",
      trimStart: toNullableNumber(settings.trimStart),
      trimEnd: toNullableNumber(settings.trimEnd),
      canvasFormat: settings.canvasFormat,
      fitMode: settings.fitMode,
      quality: `${settings.resolution}${settings.fps}`,
      resolution: settings.resolution,
      fps: settings.fps,
      outputWidth: dimensions.width,
      outputHeight: dimensions.height,
      supportedFeatures: [
        "mp4",
        "trim",
        "aspectRatio",
        "resolution",
        "originalAudio",
      ],
    },
  };
}

function toSafeNumber(value: unknown, fallback: number) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function toNullableNumber(value: unknown) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

async function fetchTransformedExportWithRetry(url: string) {
  const retryStatuses = new Set([420, 423, 404, 429, 500, 502, 503, 504]);
  const delays = [1000, 2000, 4000, 8000, 12000];
  let lastStatus = 0;

  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    console.info("[Lumeo Export] transformed MP4 fetch attempt started", {
      attempt: attempt + 1,
    });

    const response = await fetch(url, {
      cache: "no-store",
    });

    lastStatus = response.status;

    if (response.ok) {
      return Buffer.from(await response.arrayBuffer());
    }

    console.warn("[Lumeo Export] transformed MP4 fetch attempt failed", {
      attempt: attempt + 1,
      status: response.status,
      retryable: retryStatuses.has(response.status),
    });

    if (!retryStatuses.has(response.status) || attempt === delays.length) {
      throw new Error(`Transformed export fetch failed with status ${lastStatus}.`);
    }

    await delay(delays[attempt]);
  }

  throw new Error(`Transformed export fetch failed with status ${lastStatus}.`);
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getSafeFailureDetails(stage: ExportFailureStage) {
  switch (stage) {
    case "unknown":
      return "Export could not be started.";
    case "projectRead":
      return "Project could not be read.";
    case "mediaFileIdCheck":
      return "Saved media is missing.";
    case "settingsResolve":
      return "Export settings could not be prepared.";
    case "sourceDownload":
      return "Source media could not be prepared.";
    case "tempRenderUpload":
      return "Export preparation failed.";
    case "transformationBuild":
      return "Export settings could not be applied.";
    case "transformedFetch":
      return "Rendered video was not ready.";
    case "permanentExportUpload":
      return "Export could not be saved.";
    case "downloadUrlCreate":
      return "Download could not be prepared.";
    case "metadataSave":
      return "Export metadata could not be saved.";
    case "tempCleanup":
      return "Temporary export cleanup failed.";
    default:
      return "Export failed.";
  }
}

function createExportFileName(
  title: unknown,
  projectId: string,
  settings: ReturnType<typeof resolveExportSettings>,
) {
  const baseName =
    typeof title === "string" && title.trim()
      ? title.trim()
      : `lumeo-${projectId}`;
  const safeName =
    baseName
      .replace(/\.[^/.]+$/, "")
      .replace(/[^a-z0-9-_]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 120) || "lumeo-export";

  return `${safeName}-${settings.resolution}-${settings.fps}fps-${Date.now()}.mp4`;
}
