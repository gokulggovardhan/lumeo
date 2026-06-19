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

type DriveDownloadResult = DriveUploadResult & {
  bytes: Buffer;
};

type DriveUploadSession = {
  uploadUrl: string;
  fileName: string;
};

type DriveFileMetadata = {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdTime?: string;
  appProperties?: Record<string, string>;
};

type DriveFileAppProperties = {
  projectId?: string;
  purpose?: string;
  app?: string;
  uploadedAt?: string;
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

export async function uploadVideoBufferToDriveUploadsFolder({
  bytes,
  fileName,
  mimeType,
  size,
  appProperties,
}: {
  bytes: Buffer;
  fileName: string;
  mimeType: string;
  size: number;
  appProperties?: DriveFileAppProperties;
}): Promise<DriveUploadResult> {
  const env = getGoogleDriveStatusEnv();
  const accessToken = await getGoogleDriveAccessToken();
  const metadata = {
    name: fileName,
    parents: [env.uploadsFolderId],
    mimeType,
    ...(appProperties ? { appProperties } : {}),
  };

  const delimiter = "lumeo-drive-upload";
  const body = Buffer.concat([
    Buffer.from(
      `--${delimiter}\r\n` +
        "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
        `${JSON.stringify(metadata)}\r\n` +
        `--${delimiter}\r\n` +
        `Content-Type: ${mimeType || "application/octet-stream"}\r\n\r\n`,
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
    mimeType: payload.mimeType || mimeType,
    size: Number(payload.size || size),
  };
}

export async function uploadVideoBufferToDriveExportsFolder({
  bytes,
  fileName,
  mimeType,
  size,
  appProperties,
}: {
  bytes: Buffer;
  fileName: string;
  mimeType: string;
  size: number;
  appProperties?: DriveFileAppProperties;
}): Promise<DriveUploadResult> {
  const env = getGoogleDriveEnv();
  const accessToken = await getGoogleDriveAccessToken();
  const metadata = {
    name: fileName,
    parents: [env.exportsFolderId],
    mimeType,
    ...(appProperties ? { appProperties } : {}),
  };

  const delimiter = "lumeo-drive-export";
  const body = Buffer.concat([
    Buffer.from(
      `--${delimiter}\r\n` +
        "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
        `${JSON.stringify(metadata)}\r\n` +
        `--${delimiter}\r\n` +
        `Content-Type: ${mimeType || "application/octet-stream"}\r\n\r\n`,
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
    console.error("Google Drive export upload failed", {
      status: response.status,
      errorCode: payload.error?.code,
      errorMessage: payload.error?.message,
    });

    throw new GoogleDriveServerError(
      payload.error?.code ? `drive_${payload.error.code}` : "drive_export_failed",
      payload.error?.message || "Google Drive export upload failed.",
    );
  }

  return {
    fileId: payload.id,
    fileName: payload.name,
    mimeType: payload.mimeType || mimeType,
    size: Number(payload.size || size),
  };
}

export async function downloadDriveFileBuffer(
  fileId: string,
): Promise<DriveDownloadResult> {
  const accessToken = await getGoogleDriveAccessToken();
  const metadataParams = new URLSearchParams({
    fields: "id,name,mimeType,size",
    supportsAllDrives: "true",
  });

  const metadataResponse = await fetch(
    `${GOOGLE_DRIVE_API_URL}/files/${encodeURIComponent(fileId)}?${metadataParams.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    },
  );

  const metadata = (await metadataResponse.json()) as {
    id?: string;
    name?: string;
    mimeType?: string;
    size?: string;
    error?: {
      code?: number;
      message?: string;
    };
  };

  if (!metadataResponse.ok || !metadata.id || !metadata.name) {
    console.error("Google Drive media metadata lookup failed", {
      status: metadataResponse.status,
      errorCode: metadata.error?.code,
      errorMessage: metadata.error?.message,
    });

    throw new GoogleDriveServerError(
      metadata.error?.code ? `drive_${metadata.error.code}` : "drive_metadata_failed",
      metadata.error?.message || "Google Drive media metadata lookup failed.",
    );
  }

  const mediaParams = new URLSearchParams({
    alt: "media",
    supportsAllDrives: "true",
  });
  const mediaResponse = await fetch(
    `${GOOGLE_DRIVE_API_URL}/files/${encodeURIComponent(fileId)}?${mediaParams.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    },
  );

  if (!mediaResponse.ok) {
    console.error("Google Drive media download failed", {
      status: mediaResponse.status,
      fileId,
    });

    throw new GoogleDriveServerError(
      `drive_${mediaResponse.status}`,
      "Google Drive media download failed.",
    );
  }

  const bytes = Buffer.from(await mediaResponse.arrayBuffer());

  return {
    bytes,
    fileId: metadata.id,
    fileName: metadata.name,
    mimeType:
      metadata.mimeType ||
      mediaResponse.headers.get("content-type") ||
      "application/octet-stream",
    size: Number(metadata.size || bytes.byteLength),
  };
}

export async function createDriveDownloadUrl(fileId: string) {
  const accessToken = await getGoogleDriveAccessToken();
  const params = new URLSearchParams({
    supportsAllDrives: "true",
    fields: "id",
  });

  const response = await fetch(
    `${GOOGLE_DRIVE_API_URL}/files/${encodeURIComponent(fileId)}/permissions?${params.toString()}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        role: "reader",
        type: "anyone",
      }),
    },
  );

  if (!response.ok) {
    let payload: { error?: { code?: number; message?: string } } = {};

    try {
      payload = (await response.json()) as {
        error?: { code?: number; message?: string };
      };
    } catch {
      // Google may return an empty body for permission errors.
    }

    console.error("Google Drive download permission failed", {
      status: response.status,
      errorCode: payload.error?.code,
      errorMessage: payload.error?.message,
    });

    throw new GoogleDriveServerError(
      payload.error?.code
        ? `drive_${payload.error.code}`
        : "drive_download_permission_failed",
      payload.error?.message || "Google Drive download permission failed.",
    );
  }

  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
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

export async function findDriveUploadByName({
  fileName,
  mimeType,
  size,
}: {
  fileName: string;
  mimeType: string;
  size: number;
}): Promise<DriveFileMetadata | null> {
  const env = getGoogleDriveStatusEnv();
  const accessToken = await getGoogleDriveAccessToken();
  const escapedFileName = escapeDriveQueryString(fileName);
  const params = new URLSearchParams({
    q: `'${env.uploadsFolderId}' in parents and name = '${escapedFileName}' and trashed = false`,
    fields: "files(id,name,mimeType,size,createdTime)",
    orderBy: "createdTime desc",
    pageSize: "1",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });

  const response = await fetch(
    `${GOOGLE_DRIVE_API_URL}/files?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  const payload = (await response.json()) as {
    files?: Array<{
      id?: string;
      name?: string;
      mimeType?: string;
      size?: string;
    }>;
    error?: {
      code?: number;
      message?: string;
    };
  };

  if (!response.ok) {
    console.error("Google Drive upload verification failed", {
      status: response.status,
      errorCode: payload.error?.code,
      errorMessage: payload.error?.message,
    });

    throw new GoogleDriveServerError(
      payload.error?.code
        ? `drive_${payload.error.code}`
        : "drive_upload_verify_failed",
      payload.error?.message || "Google Drive upload verification failed.",
    );
  }

  const file = payload.files?.[0];

  if (!file?.id || !file.name) {
    return null;
  }

  if (mimeType && file.mimeType && file.mimeType !== mimeType) {
    return null;
  }

  const fileSize = Number(file.size || 0);

  if (Number.isFinite(size) && size > 0 && fileSize > 0 && fileSize !== size) {
    return null;
  }

  return {
    fileId: file.id,
    fileName: file.name,
    mimeType: file.mimeType || mimeType,
    size: fileSize || size,
  };
}

export async function listDriveUploadsFolderFiles() {
  const env = getGoogleDriveStatusEnv();
  const accessToken = await getGoogleDriveAccessToken();
  const files: DriveFileMetadata[] = [];
  let pageToken = "";

  do {
    const params = new URLSearchParams({
      q: `'${env.uploadsFolderId}' in parents and trashed = false`,
      fields:
        "nextPageToken,files(id,name,mimeType,size,createdTime,appProperties)",
      pageSize: "100",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });

    if (pageToken) {
      params.set("pageToken", pageToken);
    }

    const response = await fetch(
      `${GOOGLE_DRIVE_API_URL}/files?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    const payload = (await response.json()) as {
      nextPageToken?: string;
      files?: Array<{
        id?: string;
        name?: string;
        mimeType?: string;
        size?: string;
        createdTime?: string;
        appProperties?: Record<string, string>;
      }>;
      error?: {
        code?: number;
        message?: string;
      };
    };

    if (!response.ok) {
      console.error("Google Drive uploads list failed", {
        status: response.status,
        errorCode: payload.error?.code,
        errorMessage: payload.error?.message,
      });

      throw new GoogleDriveServerError(
        payload.error?.code ? `drive_${payload.error.code}` : "drive_list_failed",
        payload.error?.message || "Google Drive uploads list failed.",
      );
    }

    for (const file of payload.files || []) {
      if (!file.id || !file.name) continue;

      files.push({
        fileId: file.id,
        fileName: file.name,
        mimeType: file.mimeType || "",
        size: Number(file.size || 0),
        createdTime: file.createdTime,
        appProperties: file.appProperties,
      });
    }

    pageToken = payload.nextPageToken || "";
  } while (pageToken);

  return files;
}

export async function deleteDriveFile(fileId: string) {
  const accessToken = await getGoogleDriveAccessToken();
  const params = new URLSearchParams({
    supportsAllDrives: "true",
  });

  const response = await fetch(
    `${GOOGLE_DRIVE_API_URL}/files/${encodeURIComponent(fileId)}?${params.toString()}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (response.ok || response.status === 404) {
    return;
  }

  let payload: { error?: { code?: number; message?: string } } = {};

  try {
    payload = (await response.json()) as {
      error?: { code?: number; message?: string };
    };
  } catch {
    // Google may return an empty body for delete errors.
  }

  console.error("Google Drive file delete failed", {
    status: response.status,
    errorCode: payload.error?.code,
    errorMessage: payload.error?.message,
  });

  throw new GoogleDriveServerError(
    payload.error?.code ? `drive_${payload.error.code}` : "drive_delete_failed",
    payload.error?.message || "Google Drive file delete failed.",
  );
}

function escapeDriveQueryString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
