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
  frameMode?:
    | "fullFrame"
    | "originalView"
    | "blurredBackground"
    | "Full Frame"
    | "Original View"
    | "Blurred Background"
    | string;
  background?: Partial<PhaseOneBackgroundSettings>;
  titleOverlay?: Partial<PhaseOneTitleOverlay>;
};

type PhaseOneBackgroundSettings = {
  blurStyle: "soft" | "premium" | "strong" | string;
  dimStyle: "balanced" | "dark" | string;
};

type PhaseOneTitleOverlay = {
  enabled: boolean;
  text: string;
  style:
    | "cleanWhite"
    | "creatorYellow"
    | "neonGreen"
    | "boldCaption"
    | "lowerThird"
    | string;
  position: "top" | "center" | "bottom" | "lowerThird" | string;
  size: "small" | "medium" | "large" | "xl" | string;
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

  const transformation: Record<string, unknown>[] = [];
  const trim: Record<string, number> = {};
  const frameMode = normalizePhaseOneFrameMode(
    options.frameMode || options.fitMode,
  );
  const background = normalizeBackgroundSettings(options.background);

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

  if (frameMode === "blurredBackground") {
    transformation.push({
      width: options.width,
      height: options.height,
      crop: "fill",
    });

    transformation.push({
      effect: `blur:${getBackgroundBlurStrength(background.blurStyle)}`,
    });

    transformation.push({
      effect: `brightness:${getBackgroundBrightness(background.dimStyle)}`,
    });

    transformation.push({
      effect: "saturation:15",
    });

    transformation.push({
      overlay: {
        resource_type: "video",
        public_id: publicId,
      },
      ...trim,
      width: options.width,
      height: options.height,
      crop: "fit",
    });

    transformation.push({
      flags: "layer_apply",
      gravity: "center",
    });
  } else {
    transformation.push({
      width: options.width,
      height: options.height,
      crop: frameMode === "fullFrame" ? "fill" : "pad",
      background: "black",
    });
  }

  const titleOverlay = normalizeTitleOverlay(options.titleOverlay);

  if (titleOverlay.enabled) {
    transformation.push(...createTitleOverlayTransformation(titleOverlay, {
      width: options.width,
      height: options.height,
    }));
  }

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

function normalizeTitleOverlay(
  value: Partial<PhaseOneTitleOverlay> | undefined,
): PhaseOneTitleOverlay {
  const text = sanitizeTitleText(value?.text);
  const enabled = Boolean(value?.enabled) && text.length > 0;

  return {
    enabled,
    text: enabled ? text : "",
    style: normalizeTitleStyle(value?.style),
    position: normalizeTitlePosition(value?.position),
    size: normalizeTitleSize(value?.size),
  };
}

function normalizeBackgroundSettings(
  value: Partial<PhaseOneBackgroundSettings> | undefined,
): PhaseOneBackgroundSettings {
  return {
    blurStyle:
      value?.blurStyle === "soft" || value?.blurStyle === "strong"
        ? value.blurStyle
        : "premium",
    dimStyle: value?.dimStyle === "dark" ? "dark" : "balanced",
  };
}

function getBackgroundBlurStrength(style: string) {
  if (style === "soft") return 1200;
  if (style === "strong") return 1800;
  return 1500;
}

function getBackgroundBrightness(style: string) {
  return style === "dark" ? -48 : -35;
}

function createTitleOverlayTransformation(
  title: PhaseOneTitleOverlay,
  dimensions: { width: number; height: number },
) {
  const style = getTitleStyle(title.style);
  const position = getTitlePosition(title.position);
  const fontSize = getTitleFontSize(title.size, dimensions.width);
  const textLayer: Record<string, unknown> = {
    overlay: {
      font_family: "Arial",
      font_size: fontSize,
      font_weight: "bold",
      text: title.text,
    },
    color: style.color,
    effect: style.effect,
    width: Math.round(dimensions.width * 0.86),
    crop: "fit",
  };

  if (style.background) {
    textLayer.background = style.background;
    textLayer.radius = Math.round(fontSize * 0.35);
  }

  return [
    textLayer,
    {
      flags: "layer_apply",
      gravity: position.gravity,
      y: position.y,
    },
  ];
}

function sanitizeTitleText(value: unknown) {
  if (typeof value !== "string") return "";

  return value.replace(/\s+/g, " ").trim().slice(0, 80);
}

function normalizeTitleStyle(value: unknown) {
  return value === "creatorYellow" ||
    value === "neonGreen" ||
    value === "boldCaption" ||
    value === "lowerThird"
    ? value
    : "cleanWhite";
}

function normalizeTitlePosition(value: unknown) {
  return value === "top" ||
    value === "center" ||
    value === "lowerThird"
    ? value
    : "bottom";
}

function normalizeTitleSize(value: unknown) {
  return value === "small" || value === "medium" || value === "xl"
    ? value
    : "large";
}

function getTitleStyle(style: string) {
  if (style === "creatorYellow") {
    return { color: "#FFD84D", effect: "shadow:50" };
  }

  if (style === "neonGreen") {
    return { color: "#65FF8A", effect: "shadow:50" };
  }

  if (style === "boldCaption") {
    return { color: "#FFFFFF", effect: "shadow:35", background: "#000000" };
  }

  if (style === "lowerThird") {
    return { color: "#FFFFFF", effect: "shadow:35", background: "#000000" };
  }

  return { color: "#FFFFFF", effect: "shadow:45" };
}

function getTitlePosition(position: string) {
  if (position === "top") {
    return { gravity: "north", y: 120 };
  }

  if (position === "center") {
    return { gravity: "center", y: 0 };
  }

  if (position === "lowerThird") {
    return { gravity: "south", y: 220 };
  }

  return { gravity: "south", y: 120 };
}

function getTitleFontSize(size: string, width: number) {
  const base = Math.max(28, Math.round(width * 0.075));

  if (size === "small") return Math.round(base * 0.72);
  if (size === "medium") return Math.round(base * 0.9);
  if (size === "xl") return Math.round(base * 1.32);
  return base;
}

function normalizePhaseOneFrameMode(
  value: unknown,
): "originalView" | "fullFrame" | "blurredBackground" {
  if (
    value === "contain" ||
    value === "fit" ||
    value === "Original View" ||
    value === "originalView"
  ) {
    return "originalView";
  }

  if (
    value === "blurredBackground" ||
    value === "Blurred Background"
  ) {
    return "blurredBackground";
  }

  return "fullFrame";
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
