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

    let referencedFileIds: Set<string>;

    try {
      referencedFileIds = await getReferencedProjectFileIds();
      stages.firestoreProjectsQueryOk = true;
      stages.referencedFileIdCount = referencedFileIds.size;
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
      if (referencedFileIds.has(file.fileId)) return false;
      if (!file.createdTime) return false;

      const createdAt = Date.parse(file.createdTime);

      return Number.isFinite(createdAt) && now - createdAt >= minAgeMs;
    });
    stages.orphanCandidateCount = orphanCandidates.length;
    const deletedFileIds: string[] = [];

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
      referencedCount: referencedFileIds.size,
      candidateCount: orphanCandidates.length,
      deletedCount: deletedFileIds.length,
      stages,
      candidates: orphanCandidates.map((file) => ({
        fileId: file.fileId,
        fileName: file.fileName,
        mimeType: file.mimeType,
        size: file.size,
        createdTime: file.createdTime || null,
        app: file.appProperties?.app || null,
        purpose: file.appProperties?.purpose || null,
        projectId: file.appProperties?.projectId || null,
      })),
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

async function getReferencedProjectFileIds() {
  const db = getFirebaseAdminDb();
  const snapshot = await db.collection("projects").get();
  const referencedFileIds = new Set<string>();

  snapshot.forEach((document) => {
    const data = document.data();

    collectProjectFileIds(data, referencedFileIds);
  });


  return referencedFileIds;
}

function collectProjectFileIds(project: Record<string, unknown>, fileIds: Set<string>) {
  collectFileIdsFromValue(project.editor, fileIds);
  collectFileIdsFromValue(project.export, fileIds);
  collectFileIdsFromValue(project.exports, fileIds);
}

function collectFileIdsFromValue(value: unknown, fileIds: Set<string>) {
  if (!value || typeof value !== "object") return;

  if (Array.isArray(value)) {
    for (const item of value) {
      collectFileIdsFromValue(item, fileIds);
    }

    return;
  }

  if ("fileId" in value && typeof value.fileId === "string" && value.fileId) {
    fileIds.add(value.fileId);
  }

  for (const child of Object.values(value)) {
    collectFileIdsFromValue(child, fileIds);
  }
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
