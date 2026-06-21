import { NextRequest, NextResponse } from "next/server";
import {
  deleteDriveFiles,
  getGoogleDriveAccessToken,
  listDriveExportsFolderFiles,
  listDriveTempFolderFiles,
  listDriveUploadsFolderFiles,
  type DriveFileMetadata,
} from "@/lib/googleDriveServer";
import {
  FirebaseAdminConfigError,
  getFirebaseAdminDb,
} from "@/lib/firebaseAdmin";

const DEFAULT_MIN_AGE_MINUTES = 30;

type ScannedFile = DriveFileMetadata & {
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

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const expectedToken = process.env.LUMEO_ADMIN_CLEANUP_TOKEN;

  if (!expectedToken) {
    return NextResponse.json(
      {
        success: false,
        error: "Cleanup failed.",
        reason: "Cleanup token is not configured.",
      },
      { status: 500 },
    );
  }

  const token = request.nextUrl.searchParams.get("token");

  if (token !== expectedToken) {
    return NextResponse.json(
      {
        success: false,
        error: "Cleanup failed.",
        reason: "Cleanup token did not match.",
      },
      { status: 401 },
    );
  }

  const confirm = request.nextUrl.searchParams.get("confirm") === "true";
  const force = request.nextUrl.searchParams.get("force") === "true";
  const dryRun = !confirm;
  const minAgeMinutes = Math.max(
    DEFAULT_MIN_AGE_MINUTES,
    Number(request.nextUrl.searchParams.get("minAgeMinutes")) ||
      DEFAULT_MIN_AGE_MINUTES,
  );

  try {
    await getGoogleDriveAccessToken();

    const [uploads, exports, temp] = await Promise.all([
      listDriveUploadsFolderFiles(),
      listDriveExportsFolderFiles().catch((error) => {
        console.error("[Lumeo Cleanup] exports folder scan failed", error);
        return [] as DriveFileMetadata[];
      }),
      listDriveTempFolderFiles().catch((error) => {
        console.error("[Lumeo Cleanup] temp folder scan failed", error);
        return [] as DriveFileMetadata[];
      }),
    ]);
    const scannedFiles: ScannedFile[] = [
      ...uploads.map((file) => ({ ...file, folder: "uploads" as const })),
      ...exports.map((file) => ({ ...file, folder: "exports" as const })),
      ...temp.map((file) => ({ ...file, folder: "temp" as const })),
    ];
    const projectReferences = await getProjectReferenceDiagnostics();
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
          dryRun: false,
          error: "Cleanup refused.",
          reason:
            "No referenced project media files were found. Verify project media metadata before deleting.",
          scanned: toScannedSummary(scannedFiles),
          candidates: toSafeCandidateList(candidates),
          deleted: 0,
          skipped: candidates.length,
          ...toSafeProjectReferenceDiagnostics(projectReferences),
        },
        { status: 409 },
      );
    }

    let deleted = 0;
    let failedDeletes = 0;

    if (confirm) {
      const result = await deleteDriveFiles(
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
      candidates: toSafeCandidateList(candidates),
      deleted,
      skipped: dryRun ? candidates.length : failedDeletes,
      reason: dryRun
        ? "Dry run only. Add confirm=true to delete candidates after review."
        : failedDeletes > 0
          ? "Cleanup completed with some files skipped."
          : "Cleanup complete.",
      ...toSafeProjectReferenceDiagnostics(projectReferences),
    });
  } catch (error) {
    console.error("[Lumeo Cleanup] cleanup failed", error);

    return NextResponse.json(
      {
        success: false,
        dryRun,
        error: "Cleanup failed.",
        reason: getSafeErrorMessage(error),
      },
      { status: 500 },
    );
  }
}

async function getProjectReferenceDiagnostics(): Promise<ProjectReferenceDiagnostics> {
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
    total: files.length,
    uploads: files.filter((file) => file.folder === "uploads").length,
    exports: files.filter((file) => file.folder === "exports").length,
    temp: files.filter((file) => file.folder === "temp").length,
    lumeoOwned: files.filter(isLumeoOwnedFile).length,
  };
}

function toSafeCandidateList(files: CleanupCandidate[]) {
  return files.map((file) => ({
    fileName: file.fileName,
    folder: file.folder,
    mimeType: file.mimeType,
    size: file.size,
    createdTime: file.createdTime || null,
    purpose: file.appProperties?.purpose || null,
    projectTagged: Boolean(file.appProperties?.projectId),
    reason: file.reason,
  }));
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

function getSafeErrorMessage(error: unknown) {
  if (error instanceof FirebaseAdminConfigError) {
    return "Project references could not be loaded.";
  }

  if (error instanceof Error && error.message) {
    return error.message.slice(0, 180);
  }

  return "Unexpected cleanup failure.";
}
