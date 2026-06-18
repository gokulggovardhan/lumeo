const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_DRIVE_API_URL = "https://www.googleapis.com/drive/v3";
const GOOGLE_DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3";

type GoogleDriveEnv = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  refreshToken: string;
  rootFolderId: string;
  uploadsFolderId: string;
  exportsFolderId: string;
  tempFolderId: string;
};

export type GoogleDriveEnvPresence = {
  clientId: boolean;
  clientSecret: boolean;
  redirectUri: boolean;
  refreshToken: boolean;
  uploadsFolderId: boolean;
};

export class GoogleDriveServerError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "GoogleDriveServerError";
    this.code = code;
  }
}

type DriveFolderMetadata = {
  id: string;
  name: string;
};

type DriveUploadResult = {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
};

type DriveUploadSession = {
  uploadUrl: string;
  fileName: string;
};

export function getGoogleDriveEnv(): GoogleDriveEnv {
  const env = {
    clientId: process.env.GOOGLE_DRIVE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_DRIVE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_DRIVE_REDIRECT_URI,
    refreshToken: process.env.GOOGLE_DRIVE_REFRESH_TOKEN,
    rootFolderId: process.env.LUMEO_DRIVE_ROOT_FOLDER_ID,
    uploadsFolderId: process.env.LUMEO_DRIVE_UPLOADS_FOLDER_ID,
    exportsFolderId: process.env.LUMEO_DRIVE_EXPORTS_FOLDER_ID,
    tempFolderId: process.env.LUMEO_DRIVE_TEMP_FOLDER_ID,
  };

  const missingKeys = Object.entries(env)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missingKeys.length > 0) {
    throw new Error(`Missing Google Drive environment: ${missingKeys.join(", ")}`);
  }

  return env as GoogleDriveEnv;
}

export function getGoogleDriveEnvPresence(): GoogleDriveEnvPresence {
  return {
    clientId: Boolean(process.env.GOOGLE_DRIVE_CLIENT_ID),
    clientSecret: Boolean(process.env.GOOGLE_DRIVE_CLIENT_SECRET),
    redirectUri: Boolean(process.env.GOOGLE_DRIVE_REDIRECT_URI),
    refreshToken: Boolean(process.env.GOOGLE_DRIVE_REFRESH_TOKEN),
    uploadsFolderId: Boolean(process.env.LUMEO_DRIVE_UPLOADS_FOLDER_ID),
  };
}

export function getGoogleDriveStatusEnv() {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_DRIVE_REDIRECT_URI;
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
  const uploadsFolderId = process.env.LUMEO_DRIVE_UPLOADS_FOLDER_ID;

  if (!clientId) {
    throw new GoogleDriveServerError("missing_client_id", "Missing Google Drive client ID.");
  }

  if (!clientSecret) {
    throw new GoogleDriveServerError(
      "missing_client_secret",
      "Missing Google Drive client secret.",
    );
  }

  if (!redirectUri) {
    throw new GoogleDriveServerError(
      "missing_redirect_uri",
      "Missing Google Drive redirect URI.",
    );
  }

  if (!refreshToken) {
    throw new GoogleDriveServerError(
      "missing_refresh_token",
      "Missing Google Drive refresh token.",
    );
  }

  if (!uploadsFolderId) {
    throw new GoogleDriveServerError(
      "missing_uploads_folder_id",
      "Missing Google Drive uploads folder ID.",
    );
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    refreshToken,
    uploadsFolderId,
  };
}

export async function getGoogleDriveAccessToken() {
  const env = getGoogleDriveStatusEnv();

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: env.clientId,
      client_secret: env.clientSecret,
      refresh_token: env.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const payload = (await response.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !payload.access_token) {
    console.error("Google Drive token refresh failed", {
      status: response.status,
      error: payload.error,
      errorDescription: payload.error_description,
    });

    throw new GoogleDriveServerError(
      payload.error || "token_refresh_failed",
      payload.error_description || "Google Drive token refresh failed.",
    );
  }

  return payload.access_token;
}

export async function getDriveFolderMetadata(folderId: string) {
  const accessToken = await getGoogleDriveAccessToken();
  const params = new URLSearchParams({
    fields: "id,name,mimeType",
    supportsAllDrives: "true",
  });

  const response = await fetch(
    `${GOOGLE_DRIVE_API_URL}/files/${encodeURIComponent(folderId)}?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  const payload = (await response.json()) as {
    id?: string;
    name?: string;
    mimeType?: string;
    error?: {
      code?: number;
      message?: string;
    };
  };

  if (!response.ok || !payload.id || !payload.name) {
    console.error("Google Drive folder metadata lookup failed", {
      status: response.status,
      folderId,
      errorCode: payload.error?.code,
      errorMessage: payload.error?.message,
    });

    throw new GoogleDriveServerError(
      payload.error?.code ? `drive_${payload.error.code}` : "folder_lookup_failed",
      payload.error?.message || "Google Drive folder metadata lookup failed.",
    );
  }

  if (payload.mimeType !== "application/vnd.google-apps.folder") {
    console.error("Google Drive uploads target is not a folder", {
      folderId,
      mimeType: payload.mimeType,
    });

    throw new GoogleDriveServerError(
      "uploads_target_not_folder",
      "Google Drive uploads target is not a folder.",
    );
  }

  return {
    id: payload.id,
    name: payload.name,
  } satisfies DriveFolderMetadata;
}

export async function uploadVideoToDriveUploadsFolder({
  file,
  fileName,
}: {
  file: File;
  fileName: string;
}): Promise<DriveUploadResult> {
  const env = getGoogleDriveStatusEnv();
  const accessToken = await getGoogleDriveAccessToken();
  const metadata = {
    name: fileName,
    parents: [env.uploadsFolderId],
    mimeType: file.type,
  };

  const delimiter = "lumeo-drive-upload";
  const bytes = Buffer.from(await file.arrayBuffer());
  const body = Buffer.concat([
    Buffer.from(
      `--${delimiter}\r\n` +
        "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
        `${JSON.stringify(metadata)}\r\n` +
        `--${delimiter}\r\n` +
        `Content-Type: ${file.type || "application/octet-stream"}\r\n\r\n`,
    ),
    bytes,
    Buffer.from(`\r\n--${delimiter}--`),
  ]);

  const params = new URLSearchParams({
    uploadType: "multipart",
    fields: "id,name,mimeType,size",
    supportsAllDrives: "true",
  });

  const response = await fetch(
    `${GOOGLE_DRIVE_UPLOAD_URL}/files?${params.toString()}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${delimiter}`,
        "Content-Length": String(body.byteLength),
      },
      body,
    },
  );

  const payload = (await response.json()) as {
    id?: string;
    name?: string;
    mimeType?: string;
    size?: string;
    error?: {
      code?: number;
      message?: string;
    };
  };

  if (!response.ok || !payload.id || !payload.name) {
    console.error("Google Drive video upload failed", {
      status: response.status,
      errorCode: payload.error?.code,
      errorMessage: payload.error?.message,
    });

    throw new GoogleDriveServerError(
      payload.error?.code ? `drive_${payload.error.code}` : "drive_upload_failed",
      payload.error?.message || "Google Drive video upload failed.",
    );
  }

  return {
    fileId: payload.id,
    fileName: payload.name,
    mimeType: payload.mimeType || file.type,
    size: Number(payload.size || file.size),
  };
}

export async function createVideoUploadSession({
  fileName,
  mimeType,
  size,
}: {
  fileName: string;
  mimeType: string;
  size: number;
}): Promise<DriveUploadSession> {
  const env = getGoogleDriveStatusEnv();
  const accessToken = await getGoogleDriveAccessToken();
  const metadata = {
    name: fileName,
    parents: [env.uploadsFolderId],
    mimeType,
  };

  const params = new URLSearchParams({
    uploadType: "resumable",
    fields: "id,name,mimeType,size",
    supportsAllDrives: "true",
  });

  const response = await fetch(
    `${GOOGLE_DRIVE_UPLOAD_URL}/files?${params.toString()}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mimeType,
        "X-Upload-Content-Length": String(size),
      },
      body: JSON.stringify(metadata),
    },
  );

  const uploadUrl = response.headers.get("location");

  if (!response.ok || !uploadUrl) {
    let payload: { error?: { code?: number; message?: string } } = {};

    try {
      payload = (await response.json()) as {
        error?: { code?: number; message?: string };
      };
    } catch {
      // Google may return an empty body when resumable session creation fails.
    }

    console.error("Google Drive resumable upload session failed", {
      status: response.status,
      errorCode: payload.error?.code,
      errorMessage: payload.error?.message,
    });

    throw new GoogleDriveServerError(
      payload.error?.code
        ? `drive_${payload.error.code}`
        : "drive_upload_session_failed",
      payload.error?.message || "Google Drive upload session failed.",
    );
  }

  return {
    uploadUrl,
    fileName,
  };
}
