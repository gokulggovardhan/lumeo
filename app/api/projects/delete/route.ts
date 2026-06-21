import { NextRequest, NextResponse } from "next/server";
import {
  deleteDriveFiles,
  listLumeoFilesByProjectId,
} from "@/lib/googleDriveServer";
import {
  FirebaseAdminConfigError,
  getFirebaseAdminAuth,
  getFirebaseAdminDb,
} from "@/lib/firebaseAdmin";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      projectId?: string;
    };
    const projectId = body.projectId?.trim();

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: "Delete failed. Please try again." },
        { status: 400 },
      );
    }

    const idToken = getBearerToken(request);

    if (!idToken) {
      return NextResponse.json(
        { success: false, error: "Delete failed. Please try again." },
        { status: 401 },
      );
    }

    const decodedToken = await getFirebaseAdminAuth().verifyIdToken(idToken);
    const db = getFirebaseAdminDb();
    const projectRef = db.collection("projects").doc(projectId);
    const snapshot = await projectRef.get();

    if (!snapshot.exists) {
      return NextResponse.json(
        { success: false, error: "Delete failed. Please try again." },
        { status: 404 },
      );
    }

    const project = snapshot.data() as Record<string, unknown>;

    if (project.ownerId !== decodedToken.uid) {
      return NextResponse.json(
        { success: false, error: "Delete failed. Please try again." },
        { status: 403 },
      );
    }

    const referencedFileIds = collectProjectFileIds(project);
    let taggedFileIds: string[] = [];
    let cleanupListFailed = false;

    try {
      const taggedFiles = await listLumeoFilesByProjectId(projectId);
      taggedFileIds = taggedFiles.map((file) => file.fileId);
    } catch (error) {
      cleanupListFailed = true;
      console.error("[Lumeo Cleanup] project-tagged file lookup failed", {
        projectId,
        error,
      });
    }

    const deleteResult = await deleteDriveFiles([
      ...referencedFileIds,
      ...taggedFileIds,
    ]);

    await projectRef.delete();

    return NextResponse.json({
      success: true,
      deletedFiles: deleteResult.deleted,
      cleanupFailed: deleteResult.failed + (cleanupListFailed ? 1 : 0),
      projectDeleted: true,
    });
  } catch (error) {
    console.error("Project delete route failed", error);

    const status = error instanceof FirebaseAdminConfigError ? 500 : 500;

    return NextResponse.json(
      { success: false, error: "Delete failed. Please try again." },
      { status },
    );
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
