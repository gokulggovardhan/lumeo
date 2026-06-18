const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_DRIVE_API_URL = "https://www.googleapis.com/drive/v3";

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

type DriveFolderMetadata = {
  id: string;
  name: string;
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

export async function getGoogleDriveAccessToken() {
  const env = getGoogleDriveEnv();

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

    throw new Error("Google Drive token refresh failed");
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

    throw new Error("Google Drive folder metadata lookup failed");
  }

  if (payload.mimeType !== "application/vnd.google-apps.folder") {
    console.error("Google Drive uploads target is not a folder", {
      folderId,
      mimeType: payload.mimeType,
    });

    throw new Error("Google Drive uploads target is not a folder");
  }

  return {
    id: payload.id,
    name: payload.name,
  } satisfies DriveFolderMetadata;
}
