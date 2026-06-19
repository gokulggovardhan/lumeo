import { NextRequest, NextResponse } from "next/server";
import {
  deleteDriveFile,
  getGoogleDriveAccessToken,
  listDriveUploadsFolderFiles,
} from "@/lib/googleDriveServer";
import {
  FirebaseAdminConfigError,
  getFirebaseAdminDb,
} from "@/lib/firebaseAdmin";

const DEFAULT_MIN_AGE_MINUTES = 30;

type CleanupStages = {
  tokenEnvPresent: boolean;
  tokenMatched: boolean;
  uploadsFolderIdPresent: boolean;
  driveAuthOk: boolean;
  driveListFilesOk: boolean;
  driveFileCount: number;
  firestoreProjectsQueryOk: boolean;
  referencedFileIdCount: number;
  orphanCandidateCount: number;
};

type ProjectReferenceDiagnostics = {
  fileIds: Set<string>;
  projectDocCount: number;
  projectDocsWithEditorMediaCount: number;
  projectDocsWithStorageCount: number;
  sampleStoragePathsFound: string[];
};

type SafeProjectReferenceDiagnostics = Omit<
  ProjectReferenceDiagnostics,
  "fileIds"
> & {
  referencedFileIdCount: number;
};

class CleanupStageError extends Error {
  stage: keyof CleanupStages | string;

  constructor(stage: keyof CleanupStages | string, message: string) {
    super(message);
    this.name = "CleanupStageError";
    this.stage = stage;
  }
}

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const stages: CleanupStages = {
    tokenEnvPresent: false,
    tokenMatched: false,
    uploadsFolderIdPresent: false,
    driveAuthOk: false,
    driveListFilesOk: false,
    driveFileCount: 0,
    firestoreProjectsQueryOk: false,
    referencedFileIdCount: 0,
    orphanCandidateCount: 0,
  };
  const expectedToken = process.env.LUMEO_ADMIN_CLEANUP_TOKEN;
  stages.tokenEnvPresent = Boolean(expectedToken);

  if (!expectedToken) {
    return NextResponse.json(
      {
        success: false,
        error: "Cleanup failed.",
        failedStage: "tokenEnvPresent",
        details: "Cleanup token is not configured.",
        stages,
      },
      { status: 500 },
    );
  }

  const token = request.nextUrl.searchParams.get("token");
  stages.tokenMatched = token === expectedToken;

  if (!stages.tokenMatched) {
    return NextResponse.json(
      {
        success: false,
        error: "Cleanup failed.",
        failedStage: "tokenMatched",
        details: "Cleanup token did not match.",
        stages,
      },
      { status: 401 },
    );
  }

  const confirm = request.nextUrl.searchParams.get("confirm") === "true";
  const minAgeMinutes = Math.max(
    DEFAULT_MIN_AGE_MINUTES,
    Number(request.nextUrl.searchParams.get("minAgeMinutes")) ||
      DEFAULT_MIN_AGE_MINUTES,
  );

  try {
    stages.uploadsFolderIdPresent = Boolean(
      process.env.LUMEO_DRIVE_UPLOADS_FOLDER_ID,
    );

    if (!stages.uploadsFolderIdPresent) {
      throw new CleanupStageError(
        "uploadsFolderIdPresent",
        "Uploads folder is not configured.",
      );
    }

    try {
      await getGoogleDriveAccessToken();
      stages.driveAuthOk = true;
    } catch (error) {
      throw toStageError("driveAuthOk", "Permanent media authorization failed.", error);
    }

    let files: Awaited<ReturnType<typeof listDriveUploadsFolderFiles>>;

    try {
      files = await listDriveUploadsFolderFiles();
      stages.driveListFilesOk = true;
      stages.driveFileCount = files.length;
    } catch (error) {
      throw toStageError("driveListFilesOk", "Could not list uploaded media.", error);
    }

    let projectReferences: ProjectReferenceDiagnostics;

    try {
      projectReferences = await getProjectReferenceDiagnostics();
      stages.firestoreProjectsQueryOk = true;
      stages.referencedFileIdCount = projectReferences.fileIds.size;
    } catch (error) {
      if (error instanceof FirebaseAdminConfigError) {
        throw toStageError(
          "firebaseAdminConfig",
          "Firebase Admin environment variables are missing.",
          error,
        );
      }

      throw toStageError(
        "firestoreProjectsQueryOk",
        "Could not read project media references.",
        error,
      );
    }

    const now = Date.now();
    const minAgeMs = minAgeMinutes * 60 * 1000;
    const orphanCandidates = files.filter((file) => {
      if (projectReferences.fileIds.has(file.fileId)) return false;
      if (!file.createdTime) return false;

      const createdAt = Date.parse(file.createdTime);

      return Number.isFinite(createdAt) && now - createdAt >= minAgeMs;
    });
    stages.orphanCandidateCount = orphanCandidates.length;
    const diagnostics = toSafeProjectReferenceDiagnostics(projectReferences);
    const deletedFileIds: string[] = [];

    if (confirm && files.length > 0 && projectReferences.fileIds.size === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Cleanup refused.",
          details:
            "No referenced project media files were found. Verify project media metadata before deleting.",
          dryRun: false,
          minAgeMinutes,
          scannedCount: files.length,
          referencedCount: projectReferences.fileIds.size,
          candidateCount: orphanCandidates.length,
          deletedCount: 0,
          stages,
          ...diagnostics,
          candidates: toSafeCandidateList(orphanCandidates),
        },
        { status: 409 },
      );
    }

    if (confirm) {
      for (const file of orphanCandidates) {
        await deleteDriveFile(file.fileId);
        deletedFileIds.push(file.fileId);
      }
    }

    return NextResponse.json({
      success: true,
      dryRun: !confirm,
      minAgeMinutes,
      scannedCount: files.length,
      referencedCount: projectReferences.fileIds.size,
      candidateCount: orphanCandidates.length,
      deletedCount: deletedFileIds.length,
      stages,
      ...diagnostics,
      candidates: toSafeCandidateList(orphanCandidates),
    });
  } catch (error) {
    console.error("Media cleanup failed", error);
    const stageError =
      error instanceof CleanupStageError
        ? error
        : new CleanupStageError("unknown", "Unexpected cleanup failure.");

    return NextResponse.json(
      {
        success: false,
        error: "Cleanup failed.",
        failedStage: stageError.stage,
        details: getSafeErrorMessage(stageError),
        stages,
      },
      { status: 500 },
    );
  }
}

async function getProjectReferenceDiagnostics(): Promise<ProjectReferenceDiagnostics> {
  const db = getFirebaseAdminDb();
  const snapshot = await db.collection("projects").get();
  const diagnostics: ProjectReferenceDiagnostics = {
    fileIds: new Set<string>(),
    projectDocCount: snapshot.size,
    projectDocsWithEditorMediaCount: 0,
    projectDocsWithStorageCount: 0,
    sampleStoragePathsFound: [],
  };

  snapshot.forEach((document) => {
    const data = document.data();

    collectProjectFileIds(data, diagnostics);
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
  const storageFileId = storage?.fileId;

  if (media) {
    diagnostics.projectDocsWithEditorMediaCount += 1;
  }

  if (storage) {
    diagnostics.projectDocsWithStorageCount += 1;
    addSampleStoragePath(diagnostics, "editor.media.storage");
  }

  if (typeof storageFileId === "string" && storageFileId.trim()) {
    diagnostics.fileIds.add(storageFileId.trim());
    addSampleStoragePath(diagnostics, "editor.media.storage.fileId");
  }

  collectFileIdsFromValue(project.export, diagnostics, "export");
  collectFileIdsFromValue(project.exports, diagnostics, "exports");
  collectFileIdsFromValue(editor?.export, diagnostics, "editor.export");
  collectFileIdsFromValue(editor?.exports, diagnostics, "editor.exports");
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

  if (
    typeof record.fileId === "string" &&
    record.fileId.trim()
  ) {
    diagnostics.fileIds.add(record.fileId.trim());
    addSampleStoragePath(diagnostics, `${path}.fileId`);
  }

  for (const [key, child] of Object.entries(record)) {
    if (key === "fileId") {
      continue;
    }

    collectFileIdsFromValue(child, diagnostics, `${path}.${key}`);
  }
}

function getRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  return value as Record<string, unknown>;
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

function toSafeProjectReferenceDiagnostics(
  diagnostics: ProjectReferenceDiagnostics,
): SafeProjectReferenceDiagnostics {
  return {
    projectDocCount: diagnostics.projectDocCount,
    projectDocsWithEditorMediaCount:
      diagnostics.projectDocsWithEditorMediaCount,
    projectDocsWithStorageCount: diagnostics.projectDocsWithStorageCount,
    referencedFileIdCount: diagnostics.fileIds.size,
    sampleStoragePathsFound: diagnostics.sampleStoragePathsFound,
  };
}

function toSafeCandidateList(
  files: Awaited<ReturnType<typeof listDriveUploadsFolderFiles>>,
) {
  return files.map((file) => ({
    fileId: file.fileId,
    fileName: file.fileName,
    mimeType: file.mimeType,
    size: file.size,
    createdTime: file.createdTime || null,
    app: file.appProperties?.app || null,
    purpose: file.appProperties?.purpose || null,
    projectId: file.appProperties?.projectId || null,
  }));
}

function toStageError(
  stage: keyof CleanupStages | string,
  safeMessage: string,
  error: unknown,
) {
  console.error("Cleanup stage failed", { stage, error });

  return new CleanupStageError(stage, safeMessage);
}

function getSafeErrorMessage(error: unknown) {
  if (error instanceof CleanupStageError) {
    return error.message;
  }

  if (error instanceof FirebaseAdminConfigError) {
    return error.message;
  }

  if (error instanceof Error && error.message) {
    return error.message.slice(0, 180);
  }

  return "Unexpected cleanup failure.";
}
