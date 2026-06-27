import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

type CloudinaryServerModule = typeof import("@/lib/cloudinaryServer");
type GoogleDriveServerModule = typeof import("@/lib/googleDriveServer");

type CanvasFormat = "9:16" | "1:1" | "4:5" | "16:9";
type ExportResolution = "720p" | "1080p";
type FrameMode = "fullFrame" | "originalView" | "blurredBackground";
type ExportFps = 30;
type BackgroundBlurStyle = "soft" | "premium" | "strong";
type BackgroundDimStyle = "balanced" | "dark";
type BackgroundSettings = {
  blurStyle: BackgroundBlurStyle;
  dimStyle: BackgroundDimStyle;
};
type ReframeSettings = {
  scale: number;
  x: number;
  y: number;
};
type TitleStyle =
  | "cleanLower"
  | "creatorBold"
  | "minimalTag"
  | "cinematic"
  | "softCaption";
type TitleAlign = "left" | "center" | "right";
type TitleSize = "small" | "medium" | "large" | "xl";
type TitlePosition = "top" | "center" | "lower" | "bottom";
type TitleOverlaySettings = {
  enabled: boolean;
  text: string;
  style: TitleStyle;
  preset: TitleStyle;
  position: TitlePosition;
  x: number;
  y: number;
  align: TitleAlign;
  size: TitleSize;
  scale: number;
  background: boolean;
  shadow: boolean;
};
type ExportFailureStage =
  | "unknown"
  | "serverModules"
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
type TransformVariant =
  | "requested"
  | "requestedWithoutTitle"
  | "stableFrame"
  | "simpleFrame";

type ExportRequestBody = {
  projectId?: string;
  settings?: {
    trimStart?: number;
    trimEnd?: number;
    canvasFormat?: CanvasFormat;
    fitMode?:
      | "contain"
      | "cover"
      | "fit"
      | "fill"
      | "fullFrame"
      | "originalView"
      | "blurredBackground"
      | "Full Frame"
      | "Original View"
      | "Blurred Background";
    frameMode?:
      | "fullFrame"
      | "originalView"
      | "blurredBackground"
      | "Full Frame"
      | "Original View"
      | "Blurred Background";
    resolution?: ExportResolution | "2k";
    fps?: number;
    reframe?: Partial<ReframeSettings>;
    background?: Partial<BackgroundSettings>;
    titles?: Partial<TitleOverlaySettings>;
    titleOverlay?: Partial<TitleOverlaySettings>;
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
        | "contain"
        | "cover"
        | "fit"
        | "fill"
        | "fullFrame"
        | "originalView"
        | "blurredBackground"
        | "Full Frame"
        | "Original View"
        | "Blurred Background";
      frameMode?: "fullFrame" | "originalView" | "blurredBackground";
      backgroundBlurStyle?: BackgroundBlurStyle;
      backgroundDimStyle?: BackgroundDimStyle;
      reframe?: Partial<ReframeSettings> & {
        safeZones?: boolean;
      };
    };
    exportSettings?: {
      resolution?: ExportResolution | "2k";
      fps?: number;
    };
    export?: {
      fileId?: string;
    } | null;
    titles?: Partial<TitleOverlaySettings>;
    titleOverlay?: Partial<TitleOverlaySettings>;
    textOverlay?: {
      text?: string;
    };
  };
};

export async function GET(request: NextRequest) {
  try {
    if (request.nextUrl.searchParams.get("ping") === "true") {
      return NextResponse.json({
        success: true,
        routeLoaded: true,
        route: "export-create",
      });
    }

    if (request.nextUrl.searchParams.get("diagnose") !== "true") {
      return NextResponse.json(
        { success: false, error: "Not found." },
        { status: 404 },
      );
    }

    const token = request.nextUrl.searchParams.get("token");

    if (
      !process.env.LUMEO_ADMIN_CLEANUP_TOKEN ||
      token !== process.env.LUMEO_ADMIN_CLEANUP_TOKEN
    ) {
      return NextResponse.json(
        {
          success: false,
          diagnose: true,
          routeLoaded: true,
          failedStage: "auth",
          details: "Admin diagnostic token is missing or invalid.",
        },
        { status: 401 },
      );
    }

    const { imports, importErrors } = await getSafeImportDiagnostics();

    return NextResponse.json({
      success:
        imports.firebaseAdminDbOnly &&
        imports.cloudinaryServer &&
        imports.googleDriveServer,
      diagnose: true,
      routeLoaded: true,
      env: getSafeExportEnvDiagnostics(),
      imports,
      importErrors,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        diagnose: true,
        routeLoaded: true,
        failedStage: "unknown",
        details: getSafeDiagnosticError(error),
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  let temporaryPublicId = "";
  let failedStage: ExportFailureStage = "unknown";
  let cloudinaryServer: CloudinaryServerModule | null = null;
  const exportStartedAt = Date.now();
  let stageStartedAt = exportStartedAt;

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

    failedStage = "serverModules";
    stageStartedAt = Date.now();
    const [
      { getFirebaseAdminDbOnly },
      loadedCloudinaryServer,
      googleDriveServer,
    ] = await Promise.all([
      import("@/lib/firebaseAdminDbOnly"),
      import("@/lib/cloudinaryServer"),
      import("@/lib/googleDriveServer"),
    ]);
    cloudinaryServer = loadedCloudinaryServer;
    logExportStageTiming("serverModules", exportStartedAt, stageStartedAt, {
      projectId,
    });

    failedStage = "projectRead";
    stageStartedAt = Date.now();
    const db = getFirebaseAdminDbOnly();
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
    logExportStageTiming("projectRead", exportStartedAt, stageStartedAt, {
      projectId,
    });
    failedStage = "mediaFileIdCheck";
    const sourceFileId = project.editor?.media?.storage?.fileId;
    const previousExportFileId = getSafeFileId(project.editor?.export);

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
    stageStartedAt = Date.now();
    const settings = resolveExportSettings(project, body.settings);
    const dimensions = getOutputDimensions(settings.canvasFormat, settings.resolution);
    logExportStageTiming("settingsResolve", exportStartedAt, stageStartedAt, {
      projectId,
      resolution: settings.resolution,
      fps: settings.fps,
      canvasFormat: settings.canvasFormat,
      frameMode: settings.frameMode,
      outputWidth: dimensions.width,
      outputHeight: dimensions.height,
    });
    console.info("[Lumeo Export] resolved export settings", {
      resolution: settings.resolution,
      fps: settings.fps,
      canvasFormat: settings.canvasFormat,
      frameMode: settings.frameMode,
      outputWidth: dimensions.width,
      outputHeight: dimensions.height,
      reframe: settings.reframe,
    });

    failedStage = "sourceDownload";
    stageStartedAt = Date.now();
    console.info("[Lumeo Export] source download started", { projectId });
    const source = await googleDriveServer.downloadDriveFileBuffer(sourceFileId);
    logExportStageTiming("sourceDownload", exportStartedAt, stageStartedAt, {
      projectId,
      sourceSize: source.size,
      sourceMimeType: source.mimeType,
    });
    console.info("[Lumeo Export] source download completed", {
      fileName: source.fileName,
      size: source.size,
      mimeType: source.mimeType,
    });

    failedStage = "tempRenderUpload";
    stageStartedAt = Date.now();
    console.info("[Lumeo Export] temporary transform source upload started", {
      projectId,
    });
    const temporarySource =
      await cloudinaryServer.uploadTemporaryCloudinaryVideoBuffer({
      bytes: source.bytes,
      fileName: source.fileName,
    });
    temporaryPublicId = temporarySource.publicId;
    logExportStageTiming("tempRenderUpload", exportStartedAt, stageStartedAt, {
      projectId,
      bytes: temporarySource.bytes,
    });
    console.info("[Lumeo Export] temporary transform source upload completed", {
      publicId: temporaryPublicId,
      bytes: temporarySource.bytes,
    });

    failedStage = "transformedFetch";
    stageStartedAt = Date.now();
    const transformedExport = await fetchTransformedExportWithFallbacks({
      cloudinaryServer,
      publicId: temporaryPublicId,
      settings,
      dimensions,
    });
    const exportBytes = transformedExport.bytes;
    logExportStageTiming("transformedFetch", exportStartedAt, stageStartedAt, {
      projectId,
      bytes: exportBytes.byteLength,
      variant: transformedExport.variant,
    });
    console.info("[Lumeo Export] transformed MP4 fetch completed", {
      size: exportBytes.byteLength,
      variant: transformedExport.variant,
    });

    const createdAt = new Date().toISOString();
    const fileName = createExportFileName(project.title, projectId, settings);

    failedStage = "permanentExportUpload";
    stageStartedAt = Date.now();
    console.info("[Lumeo Export] permanent export upload started", {
      projectId,
      fileName,
      size: exportBytes.byteLength,
    });
    const uploadedExport = await googleDriveServer.uploadVideoBufferToDriveExportsFolder({
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
    logExportStageTiming("permanentExportUpload", exportStartedAt, stageStartedAt, {
      projectId,
      bytes: exportBytes.byteLength,
    });
    console.info("[Lumeo Export] permanent export upload completed", {
      fileName: uploadedExport.fileName,
      size: uploadedExport.size,
    });

    failedStage = "downloadUrlCreate";
    stageStartedAt = Date.now();
    const downloadUrl = await googleDriveServer.createDriveDownloadUrl(
      uploadedExport.fileId,
    );
    logExportStageTiming("downloadUrlCreate", exportStartedAt, stageStartedAt, {
      projectId,
    });

    failedStage = "metadataSave";
    stageStartedAt = Date.now();
    let metadataSaved = true;
    const exportMetadata = createExportMetadata({
      fileId: uploadedExport.fileId,
      fileName: uploadedExport.fileName,
      size: uploadedExport.size,
      createdAt,
      settings,
      dimensions,
      transformVariant: transformedExport.variant,
    });

    try {
      await projectRef.update({
        "editor.export": exportMetadata,
        updatedAt: createdAt,
      });

      console.info("[Lumeo Export] project export metadata saved", { projectId });
      logExportStageTiming("metadataSave", exportStartedAt, stageStartedAt, {
        projectId,
        metadataSaved: true,
      });
    } catch (metadataError) {
      metadataSaved = false;
      console.error("[Lumeo Export] project export metadata save failed", {
        projectId,
        error: metadataError,
      });
      logExportStageTiming("metadataSave", exportStartedAt, stageStartedAt, {
        projectId,
        metadataSaved: false,
      });
    }

    if (metadataSaved) {
      await cleanupPreviousProjectExports({
        projectId,
        previousExportFileId,
        currentExportFileId: uploadedExport.fileId,
        googleDriveServer,
      });
    }

    failedStage = "tempCleanup";
    try {
      stageStartedAt = Date.now();
      console.info("[Lumeo Export] temporary cleanup started", {
        publicId: temporaryPublicId,
      });
      await cloudinaryServer.deleteTemporaryCloudinaryVideo(temporaryPublicId);
      logExportStageTiming("tempCleanup", exportStartedAt, stageStartedAt, {
        projectId,
      });
      console.info("[Lumeo Export] temporary cleanup completed", {
        publicId: temporaryPublicId,
      });
    } catch (cleanupError) {
      console.error("[Lumeo Export] temporary cleanup failed", cleanupError);
    }

    console.info("[Lumeo Export] total export duration", {
      projectId,
      totalMs: Date.now() - exportStartedAt,
    });

    return NextResponse.json({
      success: true,
      downloadUrl,
      fileName: uploadedExport.fileName,
      createdAt,
      metadataSaved,
      exportInfo: {
        quality: `${settings.resolution}${settings.fps}`,
        resolution: settings.resolution,
        fps: settings.fps,
        outputWidth: dimensions.width,
        outputHeight: dimensions.height,
        frameMode: settings.frameMode,
        format: "mp4",
        titleIncluded: settings.titleOverlay.text.length > 0,
        transformVariant: transformedExport.variant,
        transformFallbackUsed: transformedExport.variant !== "requested",
        reframeApplied: transformedExport.reframeApplied,
        reframe: settings.reframe,
      },
    });
  } catch (error) {
    console.error("[Lumeo Export] phase one export failed", {
      failedStage,
      error,
      totalMs: Date.now() - exportStartedAt,
    });

    if (temporaryPublicId) {
      try {
        await cloudinaryServer?.deleteTemporaryCloudinaryVideo(temporaryPublicId);
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
        diagnostic: getSafeExportDiagnostic(error),
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
  const frameMode = normalizeFrameMode(
    bodySettings?.frameMode ||
      bodySettings?.fitMode ||
      project.editor?.canvas?.frameMode ||
      project.editor?.canvas?.fitMode,
  );
  const resolution = normalizeResolution(
    bodySettings?.resolution || project.editor?.exportSettings?.resolution,
  );
  const fps = normalizeFps(
    resolution,
    bodySettings?.fps || project.editor?.exportSettings?.fps,
  );
  const background = normalizeBackgroundSettings(
    bodySettings?.background,
    project.editor?.canvas,
  );
  const reframe = normalizeReframeSettings(
    bodySettings?.reframe,
    project.editor?.canvas?.reframe,
  );
  const titleOverlay = normalizeTitleOverlay(
    bodySettings?.titles || bodySettings?.titleOverlay,
    project.editor?.titles || project.editor?.titleOverlay,
    project.editor?.textOverlay,
  );

  return {
    trimStart,
    trimEnd:
      trimEnd > 0 && trimEnd > trimStart
        ? trimEnd
        : project.editor?.media?.videoDuration || undefined,
    canvasFormat,
    frameMode,
    resolution,
    fps,
    background,
    reframe,
    titleOverlay,
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

  if (canvasFormat === "4:5") {
    return resolution === "1080p"
      ? { width: 1080, height: 1350 }
      : { width: 720, height: 900 };
  }

  return resolution === "1080p"
    ? { width: 1920, height: 1080 }
    : { width: 1280, height: 720 };
}

function normalizeCanvasFormat(value: unknown): CanvasFormat {
  return value === "1:1" || value === "4:5" || value === "16:9"
    ? value
    : "9:16";
}

function normalizeFrameMode(value: unknown): FrameMode {
  if (
    value === "contain" ||
    value === "fit" ||
    value === "Original View" ||
    value === "originalView"
  ) {
    return "originalView";
  }

  if (
    value === "blurredBackground" ||
    value === "Blurred Background"
  ) {
    return "blurredBackground";
  }

  return "fullFrame";
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

function normalizeBackgroundSettings(
  bodyValue: unknown,
  canvasValue: unknown,
): BackgroundSettings {
  const body =
    bodyValue && typeof bodyValue === "object"
      ? (bodyValue as Record<string, unknown>)
      : {};
  const canvas =
    canvasValue && typeof canvasValue === "object"
      ? (canvasValue as Record<string, unknown>)
      : {};

  return {
    blurStyle: normalizeBackgroundBlurStyle(
      body.blurStyle || canvas.backgroundBlurStyle,
    ),
    dimStyle: normalizeBackgroundDimStyle(
      body.dimStyle || canvas.backgroundDimStyle,
    ),
  };
}

function normalizeBackgroundBlurStyle(value: unknown): BackgroundBlurStyle {
  return value === "soft" || value === "strong" ? value : "premium";
}

function normalizeBackgroundDimStyle(value: unknown): BackgroundDimStyle {
  return value === "dark" ? value : "balanced";
}

function normalizeReframeSettings(
  bodyValue: unknown,
  savedValue: unknown,
): ReframeSettings {
  const body =
    bodyValue && typeof bodyValue === "object"
      ? (bodyValue as Record<string, unknown>)
      : {};
  const saved =
    savedValue && typeof savedValue === "object"
      ? (savedValue as Record<string, unknown>)
      : {};

  return {
    scale: clampNumber(body.scale ?? saved.scale, 0.85, 1.6, 1),
    x: clampNumber(body.x ?? saved.x, -40, 40, 0),
    y: clampNumber(body.y ?? saved.y, -40, 40, 0),
  };
}

function isReframeActive(reframe: ReframeSettings) {
  return (
    Math.abs(reframe.scale - 1) > 0.005 ||
    Math.abs(reframe.x) > 0.005 ||
    Math.abs(reframe.y) > 0.005
  );
}

function createExportMetadata({
  fileId,
  fileName,
  size,
  createdAt,
  settings,
  dimensions,
  transformVariant,
}: {
  fileId: string;
  fileName: string;
  size: number;
  createdAt: string;
  settings: ReturnType<typeof resolveExportSettings>;
  dimensions: ReturnType<typeof getOutputDimensions>;
  transformVariant: TransformVariant;
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
      frameMode: settings.frameMode,
      quality: `${settings.resolution}${settings.fps}`,
      resolution: settings.resolution,
      fps: settings.fps,
      outputWidth: dimensions.width,
      outputHeight: dimensions.height,
      background: settings.background,
      reframe: settings.reframe,
      titleOverlay: settings.titleOverlay,
      transformVariant,
      transformFallbackUsed: transformVariant !== "requested",
      supportedFeatures: [
        "mp4",
        "trim",
        "aspectRatio",
        "resolution",
        "originalAudio",
        "frameMode",
        "reframe",
        "titleOverlay",
      ],
    },
  };
}

function normalizeTitleOverlay(
  bodyValue: unknown,
  savedValue: unknown,
  legacyValue: unknown,
): TitleOverlaySettings {
  const hasBodyTitle = bodyValue && typeof bodyValue === "object";
  const hasSavedTitle = savedValue && typeof savedValue === "object";
  const source =
    hasBodyTitle
      ? (bodyValue as Record<string, unknown>)
      : hasSavedTitle
        ? (savedValue as Record<string, unknown>)
        : {};
  const legacy =
    legacyValue && typeof legacyValue === "object"
      ? (legacyValue as Record<string, unknown>)
      : {};
  const text = sanitizeTitleText(
    hasBodyTitle || hasSavedTitle ? source.text : legacy.text,
  );
  const preset = normalizeTitleStyle(source.preset || source.style);
  const position = normalizeTitlePosition(source.position);
  const positionCoordinates = getTitlePositionCoordinates(position);
  const enabled = source.enabled === false ? false : text.length > 0;

  return {
    enabled,
    text: enabled ? text : "",
    style: preset,
    preset,
    position,
    x: clampNumber(source.x ?? legacy.x, 0, 100, positionCoordinates.x),
    y: clampNumber(source.y ?? legacy.y, 8, 88, positionCoordinates.y),
    align: normalizeTitleAlign(source.align),
    size: normalizeTitleSize(source.size),
    scale: normalizeTitleScale(source.scale ?? source.size),
    background: source.background !== false,
    shadow: source.shadow !== false,
  };
}

function sanitizeTitleText(value: unknown) {
  if (typeof value !== "string") return "";

  return value.replace(/\s+/g, " ").trim().slice(0, 80);
}

function normalizeTitleStyle(value: unknown): TitleStyle {
  if (value === "creatorBold" || value === "creator") return "creatorBold";
  if (value === "minimalTag" || value === "minimal") return "minimalTag";
  if (value === "cinematic" || value === "luxury" || value === "neon") {
    return "cinematic";
  }
  if (value === "softCaption" || value === "caption") return "softCaption";
  return "cleanLower";
}

function normalizeTitleAlign(value: unknown): TitleAlign {
  return value === "left" || value === "right"
    ? value
    : "center";
}

function normalizeTitleSize(value: unknown): TitleSize {
  return value === "small" || value === "medium" || value === "xl"
    ? value
    : "large";
}

function normalizeTitlePosition(value: unknown): TitlePosition {
  return value === "top" ||
    value === "center" ||
    value === "bottom"
    ? value
    : "lower";
}

function getTitlePositionCoordinates(position: TitlePosition) {
  if (position === "top") return { x: 50, y: 14 };
  if (position === "center") return { x: 50, y: 50 };
  if (position === "bottom") return { x: 50, y: 81 };
  return { x: 50, y: 76 };
}

function normalizeTitleScale(value: unknown) {
  if (value === "small") return 0.68;
  if (value === "medium") return 1;
  if (value === "xl") return 1.6;

  return clampNumber(value, 0.65, 1.6, 1);
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) return fallback;

  return Math.min(max, Math.max(min, parsed));
}

function toSafeNumber(value: unknown, fallback: number) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function toNullableNumber(value: unknown) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

async function fetchTransformedExportWithFallbacks({
  cloudinaryServer,
  publicId,
  settings,
  dimensions,
}: {
  cloudinaryServer: CloudinaryServerModule;
  publicId: string;
  settings: ReturnType<typeof resolveExportSettings>;
  dimensions: ReturnType<typeof getOutputDimensions>;
}) {
  const variants = createTransformVariants(settings);
  let lastError: unknown = null;

  for (const variant of variants) {
    const transformedUrl = cloudinaryServer.createPhaseOneCloudinaryExportUrl(
      publicId,
      {
        trimStart: settings.trimStart,
        trimEnd: settings.trimEnd,
        width: dimensions.width,
        height: dimensions.height,
        frameMode: variant.frameMode,
        fps: settings.fps,
        background: settings.background,
        reframe: variant.reframe,
        titleOverlay: variant.titleOverlay,
      },
    );

    try {
      return {
        bytes: await fetchTransformedExportWithRetry(
          transformedUrl,
          variant.label,
        ),
        variant: variant.label,
        reframeApplied: variant.reframeApplied,
      };
    } catch (error) {
      lastError = error;

      if (
        error instanceof CloudTransformFetchError &&
        error.canTryFallback
      ) {
        console.warn("[Lumeo Export] transform variant failed, trying fallback", {
          variant: error.variant,
          status: error.status,
          cloudError: error.cloudError,
        });
        continue;
      }

      throw error;
    }
  }

  throw lastError || new Error("Transformed export failed.");
}

function createTransformVariants(settings: ReturnType<typeof resolveExportSettings>) {
  const emptyTitle = { ...settings.titleOverlay, text: "" };
  const variants: Array<{
    label: TransformVariant;
    frameMode: FrameMode;
    titleOverlay: TitleOverlaySettings;
    reframe: ReframeSettings;
    reframeApplied: boolean;
  }> = [
    {
      label: "requested",
      frameMode: settings.frameMode,
      titleOverlay: settings.titleOverlay,
      reframe: settings.reframe,
      reframeApplied: isReframeActive(settings.reframe),
    },
    {
      label: "requestedWithoutTitle",
      frameMode: settings.frameMode,
      titleOverlay: emptyTitle,
      reframe: settings.reframe,
      reframeApplied: isReframeActive(settings.reframe),
    },
    {
      label: "stableFrame",
      frameMode:
        settings.frameMode === "blurredBackground"
          ? "originalView"
          : settings.frameMode,
      titleOverlay: emptyTitle,
      reframe: { scale: 1, x: 0, y: 0 },
      reframeApplied: false,
    },
    {
      label: "simpleFrame",
      frameMode: "originalView",
      titleOverlay: emptyTitle,
      reframe: { scale: 1, x: 0, y: 0 },
      reframeApplied: false,
    },
  ];
  const seen = new Set<string>();

  return variants.filter((variant) => {
    const key = `${variant.label}:${variant.frameMode}:${variant.titleOverlay.text}:${variant.reframe.scale}:${variant.reframe.x}:${variant.reframe.y}`;

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchTransformedExportWithRetry(
  url: string,
  variant: TransformVariant,
) {
  const retryStatuses = new Set([420, 423, 404, 429, 500, 502, 503, 504]);
  const delays = [2000, 4000, 8000, 12000, 18000, 24000, 30000, 30000];
  let lastStatus = 0;
  let lastCloudError = "";
  let lastSnippet = "";

  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    console.info("[Lumeo Export] transformed MP4 fetch attempt started", {
      attempt: attempt + 1,
      variant,
    });

    const response = await fetch(url, {
      cache: "no-store",
    });

    lastStatus = response.status;
    lastCloudError = sanitizeDiagnosticText(response.headers.get("x-cld-error"));

    if (response.ok) {
      return Buffer.from(await response.arrayBuffer());
    }

    console.warn("[Lumeo Export] transformed MP4 fetch attempt failed", {
      attempt: attempt + 1,
      status: response.status,
      retryable: retryStatuses.has(response.status),
      variant,
      cloudError: lastCloudError,
    });

    if (!retryStatuses.has(response.status) || attempt === delays.length) {
      try {
        lastSnippet = sanitizeDiagnosticText(await response.text());
      } catch {
        lastSnippet = "";
      }

      throw new CloudTransformFetchError({
        status: lastStatus,
        cloudError: lastCloudError,
        responseSnippet: lastSnippet,
        variant,
        canTryFallback: !retryStatuses.has(response.status),
      });
    }

    const retryAfterMs = getRetryAfterMs(response.headers.get("retry-after"));
    const delayMs = retryAfterMs ?? delays[attempt];

    try {
      const snippet = sanitizeDiagnosticText(await response.text());
      lastSnippet = snippet;
      if (snippet) {
        console.warn("[Lumeo Export] transformed MP4 response snippet", {
          attempt: attempt + 1,
          snippet,
          variant,
        });
      }
    } catch (snippetError) {
      console.warn("[Lumeo Export] transformed MP4 snippet unavailable", {
        attempt: attempt + 1,
        error: snippetError,
      });
    }

    console.info("[Lumeo Export] transformed MP4 retry scheduled", {
      attempt: attempt + 1,
      delayMs,
      variant,
    });

    await delay(delayMs);
  }

  throw new CloudTransformFetchError({
    status: lastStatus,
    cloudError: lastCloudError,
    responseSnippet: lastSnippet,
    variant,
    canTryFallback: false,
  });
}

class CloudTransformFetchError extends Error {
  status: number;
  cloudError: string;
  responseSnippet: string;
  variant: TransformVariant;
  canTryFallback: boolean;

  constructor({
    status,
    cloudError,
    responseSnippet,
    variant,
    canTryFallback,
  }: {
    status: number;
    cloudError: string;
    responseSnippet: string;
    variant: TransformVariant;
    canTryFallback: boolean;
  }) {
    super(`Transformed export fetch failed with status ${status}.`);
    this.name = "CloudTransformFetchError";
    this.status = status;
    this.cloudError = cloudError;
    this.responseSnippet = responseSnippet;
    this.variant = variant;
    this.canTryFallback = canTryFallback;
  }
}

function getRetryAfterMs(value: string | null) {
  if (!value) return null;

  const seconds = Number(value);

  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(30000, Math.round(seconds * 1000));
  }

  const dateMs = Date.parse(value);

  if (Number.isFinite(dateMs)) {
    return Math.min(30000, Math.max(0, dateMs - Date.now()));
  }

  return null;
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function logExportStageTiming(
  stage: ExportFailureStage,
  exportStartedAt: number,
  stageStartedAt: number,
  details: Record<string, unknown> = {},
) {
  console.info("[Lumeo Export] stage timing", {
    stage,
    stageMs: Date.now() - stageStartedAt,
    totalMs: Date.now() - exportStartedAt,
    ...details,
  });
}

function getSafeFileId(value: unknown) {
  if (!value || typeof value !== "object") return "";

  const record = value as Record<string, unknown>;

  return typeof record.fileId === "string" ? record.fileId.trim() : "";
}

async function cleanupPreviousProjectExports({
  projectId,
  previousExportFileId,
  currentExportFileId,
  googleDriveServer,
}: {
  projectId: string;
  previousExportFileId: string;
  currentExportFileId: string;
  googleDriveServer: GoogleDriveServerModule;
}) {
  try {
    if (
      previousExportFileId &&
      previousExportFileId !== currentExportFileId
    ) {
      await googleDriveServer.deleteDriveFiles([previousExportFileId]);
    }

    await googleDriveServer.deleteLumeoFilesByProjectId(projectId, {
      purposes: ["export"],
      keepFileIds: [currentExportFileId],
    });
  } catch (error) {
    console.error("[Lumeo Export] previous export cleanup failed", {
      projectId,
      error,
    });
  }
}

function getSafeFailureDetails(stage: ExportFailureStage) {
  switch (stage) {
    case "unknown":
      return "Export could not be started.";
    case "serverModules":
      return "Export server modules could not be loaded.";
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
      return "Rendered video was not ready in time.";
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

  return `${safeName}-${formatCanvasSlug(settings.canvasFormat)}-${formatFrameModeSlug(
    settings.frameMode,
  )}-${settings.resolution}-${settings.fps}fps-${Date.now()}.mp4`;
}

async function getSafeImportDiagnostics() {
  const imports = {
    firebaseAdminDbOnly: false,
    cloudinaryServer: false,
    googleDriveServer: false,
  };
  const importErrors = {
    firebaseAdminDbOnly: null as string | null,
    cloudinaryServer: null as string | null,
    googleDriveServer: null as string | null,
  };

  try {
    await import("@/lib/firebaseAdminDbOnly");
    imports.firebaseAdminDbOnly = true;
  } catch (error) {
    importErrors.firebaseAdminDbOnly = getSafeDiagnosticError(error);
  }

  try {
    await import("@/lib/cloudinaryServer");
    imports.cloudinaryServer = true;
  } catch (error) {
    importErrors.cloudinaryServer = getSafeDiagnosticError(error);
  }

  try {
    await import("@/lib/googleDriveServer");
    imports.googleDriveServer = true;
  } catch (error) {
    importErrors.googleDriveServer = getSafeDiagnosticError(error);
  }

  return { imports, importErrors };
}

function getSafeExportEnvDiagnostics() {
  return {
    firebaseProjectId: Boolean(process.env.FIREBASE_PROJECT_ID),
    firebaseClientEmail: Boolean(process.env.FIREBASE_CLIENT_EMAIL),
    firebasePrivateKey: Boolean(process.env.FIREBASE_PRIVATE_KEY),
    googleDriveClientId: Boolean(process.env.GOOGLE_DRIVE_CLIENT_ID),
    googleDriveClientSecret: Boolean(process.env.GOOGLE_DRIVE_CLIENT_SECRET),
    googleDriveRefreshToken: Boolean(process.env.GOOGLE_DRIVE_REFRESH_TOKEN),
    uploadsFolderId: Boolean(process.env.LUMEO_DRIVE_UPLOADS_FOLDER_ID),
    exportsFolderId: Boolean(process.env.LUMEO_DRIVE_EXPORTS_FOLDER_ID),
    cloudinaryCloudName: Boolean(process.env.CLOUDINARY_CLOUD_NAME),
    cloudinaryApiKey: Boolean(process.env.CLOUDINARY_API_KEY),
    cloudinaryApiSecret: Boolean(process.env.CLOUDINARY_API_SECRET),
  };
}

function getSafeDiagnosticError(error: unknown) {
  if (error instanceof Error) {
    return `${error.name || "Error"}: ${error.message || "Unknown error."}`.slice(
      0,
      180,
    );
  }

  return "Unknown error.";
}

function getSafeExportDiagnostic(error: unknown) {
  if (error instanceof CloudTransformFetchError) {
    return {
      errorName: error.name,
      errorMessage: error.message.slice(0, 180),
      status: error.status,
      cloudError: error.cloudError,
      responseSnippet: error.responseSnippet,
      variant: error.variant,
    };
  }

  if (error instanceof Error) {
    return {
      errorName: (error.name || "Error").slice(0, 80),
      errorMessage: (error.message || "Unknown error.").slice(0, 180),
    };
  }

  return {
    errorName: "Unknown",
    errorMessage: "Unknown error.",
  };
}

function sanitizeDiagnosticText(value: unknown) {
  if (typeof value !== "string") return "";

  return value
    .replace(/https:\/\/res\.cloudinary\.com\/[^\s"'<>]+/g, "[redacted-url]")
    .replace(/lumeo\/export-temp\/[a-zA-Z0-9/_-]+/g, "[redacted-public-id]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function formatCanvasSlug(canvasFormat: CanvasFormat) {
  return canvasFormat.replace(":", "x");
}

function formatFrameModeSlug(frameMode: FrameMode) {
  if (frameMode === "blurredBackground") return "blurred-background";
  if (frameMode === "originalView") return "original-view";
  return "full-frame";
}
