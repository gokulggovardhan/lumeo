import { NextResponse } from "next/server";
import {
  getDriveFolderMetadata,
  getGoogleDriveAccessToken,
  getGoogleDriveEnvPresence,
  getGoogleDriveStatusEnv,
  GoogleDriveServerError,
} from "@/lib/googleDriveServer";

export const dynamic = "force-dynamic";

type StatusPayload = {
  connected: boolean;
  env: {
    clientId: boolean;
    clientSecret: boolean;
    redirectUri: boolean;
    refreshToken: boolean;
    uploadsFolderId: boolean;
  };
  tokenOk: boolean;
  folderOk: boolean;
  folderName: string | null;
  folderId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

export async function GET() {
  const payload: StatusPayload = {
    connected: false,
    env: getGoogleDriveEnvPresence(),
    tokenOk: false,
    folderOk: false,
    folderName: null,
    folderId: null,
    errorCode: null,
    errorMessage: null,
  };

  try {
    const env = getGoogleDriveStatusEnv();

    await getGoogleDriveAccessToken();
    payload.tokenOk = true;

    const folder = await getDriveFolderMetadata(env.uploadsFolderId);

    payload.folderOk = true;
    payload.folderName = folder.name;
    payload.folderId = folder.id;
    payload.connected = true;

    return NextResponse.json(payload, {
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    console.error("Google Drive status check failed", getSafeErrorLog(error));

    const safeError = getSafeError(error);

    payload.errorCode = safeError.errorCode;
    payload.errorMessage = safeError.errorMessage;

    return NextResponse.json(payload, {
      headers: NO_STORE_HEADERS,
    });
  }
}

function getSafeError(error: unknown) {
  if (error instanceof GoogleDriveServerError) {
    return {
      errorCode: error.code,
      errorMessage: error.message,
    };
  }

  if (error instanceof Error) {
    return {
      errorCode: "google_drive_status_failed",
      errorMessage: error.message,
    };
  }

  return {
    errorCode: "google_drive_status_failed",
    errorMessage: "Google Drive status check failed.",
  };
}

function getSafeErrorLog(error: unknown) {
  const safeError = getSafeError(error);

  return {
    errorCode: safeError.errorCode,
    errorMessage: safeError.errorMessage,
  };
}
