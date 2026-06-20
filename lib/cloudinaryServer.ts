import { v2 as cloudinary } from "cloudinary";

const TEMP_UPLOAD_FOLDER = "lumeo/temp";
const TEMP_EXPORT_FOLDER = "lumeo/export-temp";

type CloudinaryEnv = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
};

type TemporaryCloudinaryVideo = {
  publicId: string;
  secureUrl: string;
  bytes: number;
};

type PhaseOneTransformOptions = {
  trimStart?: number;
  trimEnd?: number;
  width: number;
  height: number;
  fps?: number | null;
  fitMode?:
    | "contain"
    | "cover"
    | "fit"
    | "fill"
    | "fullFrame"
    | "originalView"
    | "Full Frame"
    | "Original View"
    | string;
};

function getCloudinaryEnv(): CloudinaryEnv {
  const cloudName =
    process.env.CLOUDINARY_CLOUD_NAME ||
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  const missingKeys = [
    !cloudName ? "CLOUDINARY_CLOUD_NAME" : "",
    !apiKey ? "CLOUDINARY_API_KEY" : "",
    !apiSecret ? "CLOUDINARY_API_SECRET" : "",
  ].filter(Boolean);

  if (missingKeys.length > 0) {
    throw new Error(`Missing Cloudinary environment: ${missingKeys.join(", ")}`);
  }

  return {
    cloudName: cloudName as string,
    apiKey: apiKey as string,
    apiSecret: apiSecret as string,
  };
}

function configureCloudinary() {
  const env = getCloudinaryEnv();

  cloudinary.config({
    cloud_name: env.cloudName,
    api_key: env.apiKey,
    api_secret: env.apiSecret,
  });

  return env;
}

export function createSignedCloudinaryUpload() {
  const env = configureCloudinary();
  const timestamp = Math.round(Date.now() / 1000);
  const params = {
    folder: TEMP_UPLOAD_FOLDER,
    timestamp,
  };

  return {
    cloudName: env.cloudName,
    apiKey: env.apiKey,
    folder: TEMP_UPLOAD_FOLDER,
    timestamp,
    signature: cloudinary.utils.api_sign_request(params, env.apiSecret),
  };
}

export async function deleteTemporaryCloudinaryVideo(publicId: string) {
  configureCloudinary();

  return cloudinary.uploader.destroy(publicId, {
    resource_type: "video",
    invalidate: true,
  });
}

export async function uploadTemporaryCloudinaryVideoBuffer({
  bytes,
  fileName,
}: {
  bytes: Buffer;
  fileName: string;
}): Promise<TemporaryCloudinaryVideo> {
  configureCloudinary();

  const publicId = createTemporaryPublicId(fileName);

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: TEMP_EXPORT_FOLDER,
        public_id: publicId,
        resource_type: "video",
        overwrite: true,
      },
      (error, result) => {
        if (error || !result?.public_id || !result.secure_url) {
          reject(error || new Error("Temporary video upload failed."));
          return;
        }

        resolve({
          publicId: result.public_id,
          secureUrl: result.secure_url,
          bytes: Number(result.bytes || bytes.byteLength),
        });
      },
    );

    stream.end(bytes);
  });
}

export function createPhaseOneCloudinaryExportUrl(
  publicId: string,
  options: PhaseOneTransformOptions,
) {
  configureCloudinary();

  const transformation: Record<string, string | number>[] = [];
  const trim: Record<string, number> = {};
  const cropMode = normalizePhaseOneFitMode(options.fitMode);

  if (Number.isFinite(options.trimStart) && Number(options.trimStart) > 0) {
    trim.start_offset = Number(options.trimStart);
  }

  if (
    Number.isFinite(options.trimEnd) &&
    Number(options.trimEnd) > 0 &&
    Number(options.trimEnd) > Number(options.trimStart || 0)
  ) {
    trim.end_offset = Number(options.trimEnd);
  }

  if (Object.keys(trim).length > 0) {
    transformation.push(trim);
  }

  transformation.push({
    width: options.width,
    height: options.height,
    crop: cropMode === "cover" ? "fill" : "pad",
    background: "black",
  });

  transformation.push({
    video_codec: "h264",
    audio_codec: "aac",
    quality: "auto:good",
    ...(Number.isFinite(options.fps) && Number(options.fps) > 0
      ? { fps: Number(options.fps) }
      : {}),
  });

  return cloudinary.url(publicId, {
    resource_type: "video",
    secure: true,
    format: "mp4",
    transformation,
  });
}

function normalizePhaseOneFitMode(value: unknown): "contain" | "cover" {
  if (
    value === "contain" ||
    value === "fit" ||
    value === "Original View" ||
    value === "originalView"
  ) {
    return "contain";
  }

  return "cover";
}

function createTemporaryPublicId(fileName: string) {
  const safeName =
    fileName
      .replace(/\.[^/.]+$/, "")
      .replace(/[^a-z0-9-_]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 80) || "source";

  return `${safeName}-${Date.now()}`;
}
