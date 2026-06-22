import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DeleteFailureStage =
  | "requestRead"
  | "authTokenCheck"
  | "serverModules"
  | "tokenVerify"
  | "projectRead"
  | "ownershipCheck"
  | "storageCleanup"
  | "projectDelete"
  | "unknown";

type FirebaseDecodedToken = {
  uid: string;
};

export async function GET(request: NextRequest) {
  try {
    if (request.nextUrl.searchParams.get("ping") === "true") {
      return NextResponse.json({
        success: true,
        routeLoaded: true,
        route: "projects-delete",
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
          failedStage: "authTokenCheck",
          details: "Admin diagnostic token is missing or invalid.",
        },
        { status: 401 },
      );
    }

    const { imports, importErrors } = await getSafeImportDiagnostics();

    return NextResponse.json({
      success:
        imports.firebaseAdminAuthOnly &&
        imports.firebaseAdminDbOnly &&
        imports.googleDriveServer,
      diagnose: true,
      routeLoaded: true,
      env: getSafeDeleteEnvDiagnostics(),
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
        details: getSafeDiagnosticMessage(error),
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  let failedStage: DeleteFailureStage = "unknown";

  try {
    failedStage = "requestRead";
    const body = (await request.json()) as {
      projectId?: string;
    };
    const projectId = body.projectId?.trim();

    if (!projectId) {
      return deleteFailureJson({
        failedStage,
        details: "Project could not be read.",
        status: 400,
      });
    }

    failedStage = "authTokenCheck";
    const idToken = getBearerToken(request);

    if (!idToken) {
      return deleteFailureJson({
        failedStage,
        details: "Signed-in session could not be verified.",
        status: 401,
      });
    }

    failedStage = "serverModules";
    const [
      { getFirebaseAdminAuthOnly },
      { getFirebaseAdminDbOnly },
      googleDriveServer,
    ] = await Promise.all([
      import("@/lib/firebaseAdminAuthOnly"),
      import("@/lib/firebaseAdminDbOnly"),
      import("@/lib/googleDriveServer"),
    ]);

    failedStage = "tokenVerify";
    const decodedToken = (await getFirebaseAdminAuthOnly().verifyIdToken(
      idToken,
    )) as FirebaseDecodedToken;

    failedStage = "projectRead";
    const db = getFirebaseAdminDbOnly();
    const projectRef = db.collection("projects").doc(projectId);
    const snapshot = await projectRef.get();

    if (!snapshot.exists) {
      return deleteFailureJson({
        failedStage,
        details: "Project could not be read.",
        status: 404,
      });
    }

    const project = snapshot.data() as Record<string, unknown>;

    failedStage = "ownershipCheck";
    if (project.ownerId !== decodedToken.uid) {
      return deleteFailureJson({
        failedStage,
        details: "Project ownership could not be verified.",
        status: 403,
      });
    }

    failedStage = "storageCleanup";
    const referencedFileIds = collectProjectFileIds(project);
    let taggedFileIds: string[] = [];
    let cleanupListFailed = false;

    try {
      const taggedFiles = await googleDriveServer.listLumeoFilesByProjectId(
        projectId,
      );
      taggedFileIds = taggedFiles.map((file) => file.fileId);
    } catch (error) {
      cleanupListFailed = true;
      console.error("[Lumeo Cleanup] project-tagged file lookup failed", {
        projectId,
        error,
      });
    }

    const deleteResult = await googleDriveServer.deleteDriveFiles([
      ...referencedFileIds,
      ...taggedFileIds,
    ]);

    failedStage = "projectDelete";
    await projectRef.delete();

    return NextResponse.json({
      success: true,
      deletedFiles: deleteResult.deleted,
      cleanupFailed: deleteResult.failed + (cleanupListFailed ? 1 : 0),
      projectDeleted: true,
    });
  } catch (error) {
    console.error("Project delete route failed", {
      failedStage,
      error,
    });

    return deleteFailureJson({
      failedStage,
      details: getSafeStageDetails(failedStage),
      diagnostic: getSafeDiagnostic(error),
    });
  }
}

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  const [scheme, token] = authorization.split(" ");

  if (scheme.toLowerCase() !== "bearer" || !token) return "";

  return token;
}

function collectProjectFileIds(project: Record<string, unknown>) {
  const fileIds = new Set<string>();

  collectFileIdsFromValue(project.editor, fileIds);
  collectFileIdsFromValue(project.export, fileIds);
  collectFileIdsFromValue(project.exports, fileIds);

  return Array.from(fileIds);
}

function collectFileIdsFromValue(value: unknown, fileIds: Set<string>) {
  if (!value || typeof value !== "object") return;

  if (Array.isArray(value)) {
    for (const item of value) {
      collectFileIdsFromValue(item, fileIds);
    }

    return;
  }

  const record = value as Record<string, unknown>;

  if (typeof record.fileId === "string" && record.fileId.trim()) {
    fileIds.add(record.fileId.trim());
  }

  for (const child of Object.values(record)) {
    collectFileIdsFromValue(child, fileIds);
  }
}

async function getSafeImportDiagnostics() {
  const imports = {
    firebaseAdminAuthOnly: false,
    firebaseAdminDbOnly: false,
    googleDriveServer: false,
  };
  const importErrors = {
    firebaseAdminAuthOnly: null as string | null,
    firebaseAdminDbOnly: null as string | null,
    googleDriveServer: null as string | null,
  };

  try {
    await import("@/lib/firebaseAdminAuthOnly");
    imports.firebaseAdminAuthOnly = true;
  } catch (error) {
    importErrors.firebaseAdminAuthOnly = getSafeDiagnosticMessage(error);
  }

  try {
    await import("@/lib/firebaseAdminDbOnly");
    imports.firebaseAdminDbOnly = true;
  } catch (error) {
    importErrors.firebaseAdminDbOnly = getSafeDiagnosticMessage(error);
  }

  try {
    await import("@/lib/googleDriveServer");
    imports.googleDriveServer = true;
  } catch (error) {
    importErrors.googleDriveServer = getSafeDiagnosticMessage(error);
  }

  return { imports, importErrors };
}

function getSafeDeleteEnvDiagnostics() {
  return {
    firebaseProjectId: Boolean(process.env.FIREBASE_PROJECT_ID),
    firebaseClientEmail: Boolean(process.env.FIREBASE_CLIENT_EMAIL),
    firebasePrivateKey: Boolean(process.env.FIREBASE_PRIVATE_KEY),
    googleDriveClientId: Boolean(process.env.GOOGLE_DRIVE_CLIENT_ID),
    googleDriveClientSecret: Boolean(process.env.GOOGLE_DRIVE_CLIENT_SECRET),
    googleDriveRefreshToken: Boolean(process.env.GOOGLE_DRIVE_REFRESH_TOKEN),
    uploadsFolderId: Boolean(process.env.LUMEO_DRIVE_UPLOADS_FOLDER_ID),
    exportsFolderId: Boolean(process.env.LUMEO_DRIVE_EXPORTS_FOLDER_ID),
  };
}

function deleteFailureJson({
  failedStage,
  details,
  diagnostic,
  status = 500,
}: {
  failedStage: DeleteFailureStage;
  details: string;
  diagnostic?: ReturnType<typeof getSafeDiagnostic>;
  status?: number;
}) {
  return NextResponse.json(
    {
      success: false,
      error: "Delete failed. Please try again.",
      failedStage,
      details,
      diagnostic:
        diagnostic ||
        ({
          errorName: "DeleteError",
          errorMessage: details,
        } satisfies ReturnType<typeof getSafeDiagnostic>),
    },
    { status },
  );
}

function getSafeStageDetails(stage: DeleteFailureStage) {
  switch (stage) {
    case "requestRead":
      return "Delete request could not be read.";
    case "authTokenCheck":
      return "Signed-in session could not be verified.";
    case "serverModules":
      return "Delete server modules could not be loaded.";
    case "tokenVerify":
      return "Signed-in session could not be verified.";
    case "projectRead":
      return "Project could not be read.";
    case "ownershipCheck":
      return "Project ownership could not be verified.";
    case "storageCleanup":
      return "Project media cleanup could not be completed.";
    case "projectDelete":
      return "Project could not be deleted.";
    default:
      return "Delete failed. Please try again.";
  }
}

function getSafeDiagnostic(error: unknown) {
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

function getSafeDiagnosticMessage(error: unknown) {
  const diagnostic = getSafeDiagnostic(error);

  return `${diagnostic.errorName}: ${diagnostic.errorMessage}`.slice(0, 180);
}
