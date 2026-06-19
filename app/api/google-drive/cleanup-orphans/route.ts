import { NextRequest, NextResponse } from "next/server";
import {
  deleteDriveFile,
  getGoogleDriveAccessToken,
  listDriveUploadsFolderFiles,
} from "@/lib/googleDriveServer";

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

type FirestoreValue = {
  stringValue?: string;
  integerValue?: string;
  doubleValue?: number;
  booleanValue?: boolean;
  timestampValue?: string;
  nullValue?: null;
  mapValue?: {
    fields?: Record<string, FirestoreValue>;
  };
  arrayValue?: {
    values?: FirestoreValue[];
  };
};

type FirestoreListResponse = {
  documents?: Array<{
    name?: string;
    fields?: Record<string, FirestoreValue>;
  }>;
  nextPageToken?: string;
  error?: {
    code?: number;
    message?: string;
  };
};

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
  const projectId =
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    "project-lumeo";
  const apiKey =
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY;
  const referencedFileIds = new Set<string>();
  let pageToken = "";

  do {
    const params = new URLSearchParams({
      pageSize: "100",
    });

    if (pageToken) {
      params.set("pageToken", pageToken);
    }

    if (apiKey) {
      params.set("key", apiKey);
    }

    const response = await fetch(
      `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/projects?${params.toString()}`,
      {
        cache: "no-store",
      },
    );
    const payload = (await response.json()) as FirestoreListResponse;

    if (!response.ok) {
      console.error("Project reference lookup failed", {
        status: response.status,
        errorCode: payload.error?.code,
        errorMessage: payload.error?.message,
      });

      throw new Error("Project reference lookup failed.");
    }

    for (const document of payload.documents || []) {
      collectFileIds(document.fields, referencedFileIds);
    }

    pageToken = payload.nextPageToken || "";
  } while (pageToken);

  return referencedFileIds;
}

function collectFileIds(
  fields: Record<string, FirestoreValue> | undefined,
  fileIds: Set<string>,
) {
  if (!fields) return;

  for (const [key, value] of Object.entries(fields)) {
    if (key === "fileId" && value.stringValue) {
      fileIds.add(value.stringValue);
    }

    if (value.mapValue?.fields) {
      collectFileIds(value.mapValue.fields, fileIds);
    }

    for (const item of value.arrayValue?.values || []) {
      if (item.mapValue?.fields) {
        collectFileIds(item.mapValue.fields, fileIds);
      }
    }
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

  if (error instanceof Error && error.message) {
    return error.message.slice(0, 180);
  }

  return "Unexpected cleanup failure.";
}
