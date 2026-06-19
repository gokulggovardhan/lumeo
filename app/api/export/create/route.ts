import { NextRequest, NextResponse } from "next/server";
import {
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

type ExportRequestBody = {
  projectId?: string;
  settings?: {
    trimStart?: number;
    trimEnd?: number;
    canvasFormat?: CanvasFormat;
    fitMode?: FitMode;
    resolution?: ExportResolution | "2k";
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
      fitMode?: FitMode;
    };
    exportSettings?: {
      resolution?: ExportResolution | "2k";
    };
  };
};

export async function POST(request: NextRequest) {
  let temporaryPublicId = "";

  try {
    const body = (await request.json()) as ExportRequestBody;
    const projectId = typeof body.projectId === "string" ? body.projectId : "";

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: "Missing project." },
        { status: 400 },
      );
    }

    console.info("[Lumeo Export] phase one export started", { projectId });

    const db = getFirebaseAdminDb();
    const projectRef = db.collection("projects").doc(projectId);
    const snapshot = await projectRef.get();

    if (!snapshot.exists) {
      return NextResponse.json(
        { success: false, error: "Project was not found." },
        { status: 404 },
      );
    }

    const project = snapshot.data() as ProjectData;
    const sourceFileId = project.editor?.media?.storage?.fileId;

    if (!sourceFileId) {
      return NextResponse.json(
        { success: false, error: "Saved media was not found." },
        { status: 400 },
      );
    }

    const settings = resolveExportSettings(project, body.settings);
    const dimensions = getOutputDimensions(settings.canvasFormat, settings.resolution);

    console.info("[Lumeo Export] source download started", { projectId });
    const source = await downloadDriveFileBuffer(sourceFileId);
    console.info("[Lumeo Export] source download completed", {
      fileName: source.fileName,
      size: source.size,
      mimeType: source.mimeType,
    });

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

    const transformedUrl = createPhaseOneExportUrl(temporaryPublicId, {
      trimStart: settings.trimStart,
      trimEnd: settings.trimEnd,
      width: dimensions.width,
      height: dimensions.height,
      fitMode: settings.fitMode,
    });

    console.info("[Lumeo Export] transformed MP4 fetch started", { projectId });
    const transformedResponse = await fetch(transformedUrl, {
      cache: "no-store",
    });

    if (!transformedResponse.ok) {
      console.error("[Lumeo Export] transformed MP4 fetch failed", {
        status: transformedResponse.status,
      });

      throw new Error("Transformed MP4 fetch failed.");
    }

    const exportBytes = Buffer.from(await transformedResponse.arrayBuffer());
    console.info("[Lumeo Export] transformed MP4 fetch completed", {
      size: exportBytes.byteLength,
    });

    const createdAt = new Date().toISOString();
    const fileName = createExportFileName(project.title, projectId);

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

    let downloadUrl = "";

    try {
      downloadUrl = await createDriveDownloadUrl(uploadedExport.fileId);
    } catch (downloadError) {
      console.error("[Lumeo Export] download URL setup failed", downloadError);
    }

    await projectRef.update({
      "editor.export": {
        status: "complete",
        fileId: uploadedExport.fileId,
        fileName: uploadedExport.fileName,
        mimeType: "video/mp4",
        size: uploadedExport.size,
        createdAt,
        settings: {
          format: "mp4",
          trimStart: settings.trimStart,
          trimEnd: settings.trimEnd,
          canvasFormat: settings.canvasFormat,
          fitMode: settings.fitMode,
          resolution: settings.resolution,
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
      },
      updatedAt: new Date(),
    });

    console.info("[Lumeo Export] project export metadata saved", { projectId });

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
    });
  } catch (error) {
    console.error("[Lumeo Export] phase one export failed", error);

    if (temporaryPublicId) {
      try {
        await deleteTemporaryCloudinaryVideo(temporaryPublicId);
      } catch (cleanupError) {
        console.error("[Lumeo Export] failed export cleanup failed", cleanupError);
      }
    }

    return NextResponse.json(
      { success: false, error: "Export failed. Please try again." },
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

  return {
    trimStart,
    trimEnd:
      trimEnd > 0 && trimEnd > trimStart
        ? trimEnd
        : project.editor?.media?.videoDuration || undefined,
    canvasFormat,
    fitMode,
    resolution,
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
  return value === "contain" ? "contain" : "cover";
}

function normalizeResolution(value: unknown): ExportResolution {
  return "720p";
}

function createPhaseOneExportUrl(
  publicId: string,
  options: {
    trimStart?: number;
    trimEnd?: number;
    width: number;
    height: number;
    fitMode: FitMode;
  },
) {
  const cloudName =
    process.env.CLOUDINARY_CLOUD_NAME ||
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

  if (!cloudName) {
    throw new Error("Missing export media environment.");
  }

  const transformations: string[] = [];

  if (Number.isFinite(options.trimStart) && Number(options.trimStart) > 0) {
    transformations.push(`so_${Number(options.trimStart)}`);
  }

  if (
    Number.isFinite(options.trimEnd) &&
    Number(options.trimEnd) > 0 &&
    Number(options.trimEnd) > Number(options.trimStart || 0)
  ) {
    transformations.push(`eo_${Number(options.trimEnd)}`);
  }

  transformations.push(
    [
      options.fitMode === "cover" ? "c_fill" : "c_pad",
      "b_black",
      `w_${options.width}`,
      `h_${options.height}`,
    ].join(","),
  );
  transformations.push("vc_h264,ac_aac,q_auto:good");

  return `https://res.cloudinary.com/${encodeURIComponent(
    cloudName,
  )}/video/upload/${transformations.join("/")}/${publicId}.mp4`;
}

function toSafeNumber(value: unknown, fallback: number) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function createExportFileName(title: unknown, projectId: string) {
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

  return `${safeName}-${Date.now()}.mp4`;
}
