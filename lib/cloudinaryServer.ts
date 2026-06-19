import { v2 as cloudinary } from "cloudinary";

const TEMP_UPLOAD_FOLDER = "lumeo/temp";

type CloudinaryEnv = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
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
