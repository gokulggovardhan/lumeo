import { NextRequest, NextResponse } from "next/server";

const DEFAULT_MIN_AGE_MINUTES = 30;

type ScannedFile = {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdTime?: string;
  appProperties?: Record<string, string>;
  folder: "uploads" | "exports" | "temp";
};

type CleanupCandidate = ScannedFile & {
  reason: string;
};

type ProjectReferenceDiagnostics = {
  projectIds: Set<string>;
  allReferencedFileIds: Set<string>;
  activeSourceFileIds: Set<string>;
  latestExportFileIds: Set<string>;
  projectDocCount: number;
  projectDocsWithEditorMediaCount: number;
  projectDocsWithStorageCount: number;
  projectDocsWithExportCount: number;
  sampleStoragePathsFound: string[];
};

type CleanupStage =
  | "auth"
  | "envCheck"
  | "firebaseAdmin"
  | "projectScan"
  | "uploadFolderScan"
  | "exportFolderScan"
  | "tempFolderScan"
  | "candidateBuild"
  | "deleteConfirm"
  | "deleteExecute"
  | "unknown";

type CleanupEnvDiagnostics = {
  cleanupTokenConfigured: boolean;
  uploadsFolderId: boolean;
  exportsFolderId: boolean;
  tempFolderId: boolean;
  firebaseProjectId: boolean;
  firebaseClientEmail: boolean;
  firebasePrivateKey: boolean;
};

type CleanupImportsDiagnostics = {
  firebaseAdminDbOnly: boolean;
  googleDriveServer: boolean;
};

type CleanupImportErrors = {
  firebaseAdminDbOnly: string | null;
  googleDriveServer: string | null;
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  let failedStage: CleanupStage = "unknown";

  try {
    if (request.nextUrl.searchParams.get("ping") === "true") {
      return NextResponse.json({
        success: true,
        routeLoaded: true,
        dryRun: true,
        message: "Cleanup route loaded.",
      });
    }

    const env = getSafeEnvDiagnostics();

    if (request.nextUrl.searchParams.get("diagnose") === "true") {
      const { imports, importErrors } = await getSafeImportDiagnostics();

      return NextResponse.json({
        success: imports.firebaseAdminDbOnly && imports.googleDriveServer,
        dryRun: true,
        diagnose: true,
        routeLoaded: true,
        env,
        imports,
        importErrors,
        ...(imports.firebaseAdminDbOnly && imports.googleDriveServer
          ? {}
          : {
              failedStage: imports.firebaseAdminDbOnly
                ? "envCheck"
                : "firebaseAdmin",
              details: "One or more server modules could not be loaded.",
            }),
      });
    }

    failedStage = "auth";
    const token = request.nextUrl.searchParams.get("token");

    if (!env.cleanupTokenConfigured || token !== process.env.LUMEO_ADMIN_CLEANUP_TOKEN) {
      return NextResponse.json(
        {
          success: false,
          dryRun: true,
          failedStage: "auth",
          details: "Admin cleanup token is missing or invalid.",
          deleted: 0,
        },
        { status: 401 },
      );
    }

    failedStage = "envCheck";
    if (!env.uploadsFolderId) {
      return failureJson({
        failedStage,
        details: "Uploads folder is not configured.",
        env,
      });
    }

    failedStage = "firebaseAdmin";
    if (
      !env.firebaseProjectId ||
      !env.firebaseClientEmail ||
      !env.firebasePrivateKey
    ) {
      return failureJson({
        failedStage,
        details: "Project database admin configuration is missing.",
        env,
      });
    }

    const confirm = request.nextUrl.searchParams.get("confirm") === "true";
    const force = request.nextUrl.searchParams.get("force") === "true";
    const minAgeMinutes = Math.max(
      DEFAULT_MIN_AGE_MINUTES,
      Number(request.nextUrl.searchParams.get("minAgeMinutes")) ||
        DEFAULT_MIN_AGE_MINUTES,
    );
    const [{ getFirebaseAdminDbOnly }, googleDrive] = await Promise.all([
      import("@/lib/firebaseAdminDbOnly"),
      import("@/lib/googleDriveServer"),
    ]);

    failedStage = "projectScan";
    const projectReferences = await getProjectReferenceDiagnostics(
      getFirebaseAdminDbOnly,
    );

    failedStage = "uploadFolderScan";
    const uploads = await googleDrive.listDriveUploadsFolderFiles();

    failedStage = "exportFolderScan";
    const exports = env.exportsFolderId
      ? await googleDrive.listDriveExportsFolderFiles()
      : [];

    failedStage = "tempFolderScan";
    const temp = env.tempFolderId
      ? await googleDrive.listDriveTempFolderFiles()
      : [];
    const scannedFiles: ScannedFile[] = [
      ...uploads.map((file) => ({ ...file, folder: "uploads" as const })),
      ...exports.map((file) => ({ ...file, folder: "exports" as const })),
      ...temp.map((file) => ({ ...file, folder: "temp" as const })),
    ];

    failedStage = "candidateBuild";
    const minAgeMs = minAgeMinutes * 60 * 1000;
    const now = Date.now();
    const candidates = scannedFiles.filter((file) => {
      if (!isOldEnough(file, now, minAgeMs)) return false;
      if (!isLumeoOwnedFile(file)) return false;

      return getCleanupReason(file, projectReferences) !== "";
    }) as CleanupCandidate[];

    for (const candidate of candidates) {
      candidate.reason = getCleanupReason(candidate, projectReferences);
    }

    if (
      confirm &&
      scannedFiles.length > 0 &&
      projectReferences.allReferencedFileIds.size === 0 &&
      !force
    ) {
      return NextResponse.json(
        {
          success: false,
          dryRun: true,
          failedStage: "deleteConfirm",
          details:
            "No referenced project media files were found. Verify project media metadata before deleting.",
          scanned: toScannedSummary(scannedFiles),
          candidates: toCandidateSummary(candidates),
          deleted: 0,
          skipped: candidates.length,
          env,
          ...toSafeProjectReferenceDiagnostics(projectReferences),
        },
        { status: 409 },
      );
    }

    let deleted = 0;
    let failedDeletes = 0;
    const dryRun = !confirm;

    if (confirm) {
      failedStage = "deleteExecute";
      const result = await googleDrive.deleteDriveFiles(
        candidates.map((candidate) => candidate.fileId),
      );
      deleted = result.deleted;
      failedDeletes = result.failed;
    }

    return NextResponse.json({
      success: failedDeletes === 0,
      dryRun,
      minAgeMinutes,
      scanned: toScannedSummary(scannedFiles),
      candidates: toCandidateSummary(candidates),
      deleted,
      skipped: dryRun ? candidates.length : failedDeletes,
      reason: dryRun
        ? "Dry run only. Nothing deleted."
        : failedDeletes > 0
          ? "Cleanup completed with some files skipped."
          : "Cleanup complete.",
      env,
      ...toSafeProjectReferenceDiagnostics(projectReferences),
    });
  } catch (error) {
    console.error("[Lumeo Cleanup] cleanup failed", error);

    return failureJson({
      failedStage,
      details: getSafeErrorMessage(error),
      env: getSafeEnvDiagnostics(),
    });
  }
}

async function getSafeImportDiagnostics(): Promise<{
  imports: CleanupImportsDiagnostics;
  importErrors: CleanupImportErrors;
}> {
  const imports = {
    firebaseAdminDbOnly: false,
    googleDriveServer: false,
  };
  const importErrors: CleanupImportErrors = {
    firebaseAdminDbOnly: null,
    googleDriveServer: null,
  };

  try {
    await import("@/lib/firebaseAdminDbOnly");
    imports.firebaseAdminDbOnly = true;
  } catch (error) {
    importErrors.firebaseAdminDbOnly = getSafeImportError(error);
    console.error("[Lumeo Cleanup] firestore admin import failed", error);
  }

  try {
    await import("@/lib/googleDriveServer");
    imports.googleDriveServer = true;
  } catch (error) {
    importErrors.googleDriveServer = getSafeImportError(error);
    console.error("[Lumeo Cleanup] storage helper import failed", error);
  }

  return { imports, importErrors };
}

async function getProjectReferenceDiagnostics(
  getFirebaseAdminDb: () => {
    collection: (name: string) => {
      get: () => Promise<{
        size: number;
        forEach: (callback: {
          (document: { id: string; data: () => Record<string, unknown> }): void;
        }) => void;
      }>;
    };
  },
): Promise<ProjectReferenceDiagnostics> {
  const db = getFirebaseAdminDb();
  const snapshot = await db.collection("projects").get();
  const diagnostics: ProjectReferenceDiagnostics = {
    projectIds: new Set<string>(),
    allReferencedFileIds: new Set<string>(),
    activeSourceFileIds: new Set<string>(),
    latestExportFileIds: new Set<string>(),
    projectDocCount: snapshot.size,
    projectDocsWithEditorMediaCount: 0,
    projectDocsWithStorageCount: 0,
    projectDocsWithExportCount: 0,
    sampleStoragePathsFound: [],
  };

  snapshot.forEach((document) => {
    diagnostics.projectIds.add(document.id);
    collectProjectFileIds(document.data(), diagnostics);
  });

  return diagnostics;
}

function collectProjectFileIds(
  project: Record<string, unknown>,
  diagnostics: ProjectReferenceDiagnostics,
) {
  const editor = getRecord(project.editor);
  const media = getRecord(editor?.media);
  const storage = getRecord(media?.storage);
  const exportMetadata = getRecord(editor?.export);
  const storageFileId = getFileId(storage);
  const exportFileId = getFileId(exportMetadata);

  if (media) {
    diagnostics.projectDocsWithEditorMediaCount += 1;
  }

  if (storage) {
    diagnostics.projectDocsWithStorageCount += 1;
    addSampleStoragePath(diagnostics, "editor.media.storage");
  }

  if (storageFileId) {
    diagnostics.activeSourceFileIds.add(storageFileId);
    diagnostics.allReferencedFileIds.add(storageFileId);
    addSampleStoragePath(diagnostics, "editor.media.storage.fileId");
  }

  if (exportMetadata) {
    diagnostics.projectDocsWithExportCount += 1;
    addSampleStoragePath(diagnostics, "editor.export");
  }

  if (exportFileId) {
    diagnostics.latestExportFileIds.add(exportFileId);
    diagnostics.allReferencedFileIds.add(exportFileId);
    addSampleStoragePath(diagnostics, "editor.export.fileId");
  }

  collectFileIdsFromValue(editor?.exports, diagnostics, "editor.exports");
  collectFileIdsFromValue(project.export, diagnostics, "export");
  collectFileIdsFromValue(project.exports, diagnostics, "exports");
}

function collectFileIdsFromValue(
  value: unknown,
  diagnostics: ProjectReferenceDiagnostics,
  path: string,
) {
  if (!value || typeof value !== "object") return;

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectFileIdsFromValue(item, diagnostics, `${path}.${index}`);
    });

    return;
  }

  const record = getRecord(value);

  if (!record) return;

  const fileId = getFileId(record);

  if (fileId) {
    diagnostics.allReferencedFileIds.add(fileId);
    addSampleStoragePath(diagnostics, `${path}.fileId`);
  }

  for (const [key, child] of Object.entries(record)) {
    if (key !== "fileId") {
      collectFileIdsFromValue(child, diagnostics, `${path}.${key}`);
    }
  }
}

function getCleanupReason(
  file: ScannedFile,
  diagnostics: ProjectReferenceDiagnostics,
) {
  const projectId = file.appProperties?.projectId || "";
  const purpose = file.appProperties?.purpose || "";

  if (!projectId) return "missingProjectTag";
  if (!diagnostics.projectIds.has(projectId)) return "projectDeleted";
  if (purpose === "source" || purpose === "upload") {
    return diagnostics.activeSourceFileIds.has(file.fileId)
      ? ""
      : "inactiveSource";
  }
  if (purpose === "export") {
    return diagnostics.latestExportFileIds.has(file.fileId) ? "" : "oldExport";
  }
  if (purpose === "temp") return "oldTemp";

  return diagnostics.allReferencedFileIds.has(file.fileId)
    ? ""
    : "unreferencedLumeoFile";
}

function isOldEnough(file: ScannedFile, now: number, minAgeMs: number) {
  if (!file.createdTime) return false;

  const createdAt = Date.parse(file.createdTime);

  return Number.isFinite(createdAt) && now - createdAt >= minAgeMs;
}

function isLumeoOwnedFile(file: ScannedFile) {
  return (
    file.appProperties?.app === "lumeo" ||
    file.fileName.toLowerCase().startsWith("lumeo-")
  );
}

function getRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  return value as Record<string, unknown>;
}

function getFileId(value: unknown) {
  const record = getRecord(value);

  if (!record || typeof record.fileId !== "string") return "";

  return record.fileId.trim();
}

function addSampleStoragePath(
  diagnostics: ProjectReferenceDiagnostics,
  path: string,
) {
  if (
    diagnostics.sampleStoragePathsFound.length < 8 &&
    !diagnostics.sampleStoragePathsFound.includes(path)
  ) {
    diagnostics.sampleStoragePathsFound.push(path);
  }
}

function toScannedSummary(files: ScannedFile[]) {
  return {
    uploads: files.filter((file) => file.folder === "uploads").length,
    exports: files.filter((file) => file.folder === "exports").length,
    temp: files.filter((file) => file.folder === "temp").length,
    total: files.length,
  };
}

function toCandidateSummary(files: CleanupCandidate[]) {
  return {
    uploads: files.filter((file) => file.folder === "uploads").length,
    exports: files.filter((file) => file.folder === "exports").length,
    temp: files.filter((file) => file.folder === "temp").length,
    total: files.length,
  };
}

function toSafeProjectReferenceDiagnostics(
  diagnostics: ProjectReferenceDiagnostics,
) {
  return {
    projectDocCount: diagnostics.projectDocCount,
    projectDocsWithEditorMediaCount:
      diagnostics.projectDocsWithEditorMediaCount,
    projectDocsWithStorageCount: diagnostics.projectDocsWithStorageCount,
    projectDocsWithExportCount: diagnostics.projectDocsWithExportCount,
    referencedFileIdCount: diagnostics.allReferencedFileIds.size,
    activeSourceFileIdCount: diagnostics.activeSourceFileIds.size,
    latestExportFileIdCount: diagnostics.latestExportFileIds.size,
    sampleStoragePathsFound: diagnostics.sampleStoragePathsFound,
  };
}

function getSafeEnvDiagnostics(): CleanupEnvDiagnostics {
  return {
    cleanupTokenConfigured: Boolean(process.env.LUMEO_ADMIN_CLEANUP_TOKEN),
    uploadsFolderId: Boolean(process.env.LUMEO_DRIVE_UPLOADS_FOLDER_ID),
    exportsFolderId: Boolean(process.env.LUMEO_DRIVE_EXPORTS_FOLDER_ID),
    tempFolderId: Boolean(process.env.LUMEO_DRIVE_TEMP_FOLDER_ID),
    firebaseProjectId: Boolean(process.env.FIREBASE_PROJECT_ID),
    firebaseClientEmail: Boolean(process.env.FIREBASE_CLIENT_EMAIL),
    firebasePrivateKey: Boolean(process.env.FIREBASE_PRIVATE_KEY),
  };
}

function getSafeErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message.slice(0, 180);
  }

  return "Unexpected cleanup failure.";
}

function getSafeImportError(error: unknown) {
  if (error instanceof Error) {
    const name = error.name || "Error";
    const message = error.message || "Module import failed.";

    return `${name}: ${message}`.slice(0, 180);
  }

  return "Module import failed.";
}

function failureJson({
  failedStage,
  details,
  env,
  status = 500,
}: {
  failedStage: CleanupStage;
  details: string;
  env: CleanupEnvDiagnostics;
  status?: number;
}) {
  return NextResponse.json(
    {
      success: false,
      dryRun: true,
      failedStage,
      details,
      deleted: 0,
      env,
    },
    { status },
  );
}
