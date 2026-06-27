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
  reframe?: Partial<PhaseOneReframeSettings>;
  titleOverlay?: Partial<PhaseOneTitleOverlay>;
};

type PhaseOneBackgroundSettings = {
  blurStyle: "soft" | "premium" | "strong" | string;
  dimStyle: "balanced" | "dark" | string;
};

type PhaseOneReframeSettings = {
  scale: number;
  x: number;
  y: number;
};

type PhaseOneTitleOverlay = {
  enabled?: boolean;
  text: string;
  style:
    | "cleanLower"
    | "creatorBold"
    | "minimalTag"
    | "cinematic"
    | "softCaption"
    | string;
  preset?: string;
  position?: "top" | "center" | "lower" | "bottom" | string;
  x: number;
  y: number;
  align: "left" | "center" | "right" | string;
  size: "small" | "medium" | "large" | "xl" | string;
  scale?: number;
  background?: boolean;
  shadow?: boolean;
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
  const reframe = normalizeReframeSettings(options.reframe);
  const reframeActive = isReframeActive(reframe);

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
      width: Math.round(options.width * reframe.scale),
      height: Math.round(options.height * reframe.scale),
      crop: "fit",
    });

    transformation.push({
      flags: "layer_apply",
      gravity: "center",
      ...(reframeActive
        ? {
            x: getLayerOffset(options.width, reframe.x),
            y: getLayerOffset(options.height, reframe.y),
          }
        : {}),
    });
  } else {
    transformation.push({
      width: Math.round(options.width * reframe.scale),
      height: Math.round(options.height * reframe.scale),
      crop: frameMode === "fullFrame" ? "fill" : "pad",
      background: "black",
    });

    if (reframeActive) {
      transformation.push({
        width: options.width,
        height: options.height,
        crop: "crop",
        gravity: "center",
        x: getLayerOffset(options.width, reframe.x),
        y: getLayerOffset(options.height, reframe.y),
      });
    }
  }

  const titleOverlay = normalizeTitleOverlay(options.titleOverlay);

  if (titleOverlay.text.length > 0) {
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
  const style = normalizeTitleStyle(value?.preset || value?.style);
  const position = normalizeTitlePosition(value?.position);
  const coordinates = getTitlePositionCoordinates(position);
  const enabled = value?.enabled === false ? false : text.length > 0;

  return {
    enabled,
    text: enabled ? text : "",
    style,
    preset: style,
    position,
    x: clampNumber(value?.x, 0, 100, coordinates.x),
    y: clampNumber(value?.y, 8, 88, coordinates.y),
    align: normalizeTitleAlign(value?.align),
    size: normalizeTitleSize(value?.size),
    scale: normalizeTitleScale(value?.scale ?? value?.size),
    background: value?.background !== false,
    shadow: value?.shadow !== false,
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

function normalizeReframeSettings(
  value: Partial<PhaseOneReframeSettings> | undefined,
): PhaseOneReframeSettings {
  return {
    scale: clampNumber(value?.scale, 0.85, 1.6, 1),
    x: clampNumber(value?.x, -40, 40, 0),
    y: clampNumber(value?.y, -40, 40, 0),
  };
}

function isReframeActive(reframe: PhaseOneReframeSettings) {
  return (
    Math.abs(reframe.scale - 1) > 0.005 ||
    Math.abs(reframe.x) > 0.005 ||
    Math.abs(reframe.y) > 0.005
  );
}

function getLayerOffset(size: number, percent: number) {
  return Math.round((size * percent) / 100);
}

function getBackgroundBlurStrength(style: string) {
  if (style === "soft") return 400;
  if (style === "strong") return 900;
  return 700;
}

function getBackgroundBrightness(style: string) {
  return style === "dark" ? -40 : -25;
}

function createTitleOverlayTransformation(
  title: PhaseOneTitleOverlay,
  dimensions: { width: number; height: number },
) {
  const style = getTitleStyle(title.style);
  const fontSize = getTitleFontSize(title, dimensions.width);
  const maxWidth = Math.round(dimensions.width * (title.background ? 0.88 : 0.84));
  const layerX = Math.round(((title.x - 50) / 100) * dimensions.width);
  const layerY = Math.round(((title.y - 50) / 100) * dimensions.height);
  const textLayer: Record<string, unknown> = {
    overlay: {
      font_family: "Arial",
      font_size: fontSize,
      font_weight: style.fontWeight,
      text: title.text,
    },
    color: style.color,
    width: maxWidth,
    crop: "fit",
  };

  if (title.background && style.background) {
    textLayer.background = style.background;
  }

  return [
    textLayer,
    {
      flags: "layer_apply",
      gravity: "center",
      x: layerX,
      y: layerY,
    },
  ];
}

function sanitizeTitleText(value: unknown) {
  if (typeof value !== "string") return "";

  return value.replace(/\s+/g, " ").trim().slice(0, 80);
}

function normalizeTitleStyle(value: unknown) {
  if (value === "creatorBold" || value === "creator") return "creatorBold";
  if (value === "minimalTag" || value === "minimal") return "minimalTag";
  if (value === "cinematic" || value === "luxury" || value === "neon") {
    return "cinematic";
  }
  if (value === "softCaption" || value === "caption") return "softCaption";
  return "cleanLower";
}

function normalizeTitleAlign(value: unknown) {
  return value === "left" || value === "right"
    ? value
    : "center";
}

function normalizeTitleSize(value: unknown) {
  return value === "small" || value === "medium" || value === "xl"
    ? value
    : "large";
}

function normalizeTitlePosition(value: unknown) {
  return value === "top" || value === "center" || value === "bottom"
    ? value
    : "lower";
}

function getTitlePositionCoordinates(position: string) {
  if (position === "top") return { x: 50, y: 14 };
  if (position === "center") return { x: 50, y: 50 };
  if (position === "bottom") return { x: 50, y: 81 };
  return { x: 50, y: 76 };
}

function normalizeTitleScale(value: unknown) {
  if (value === "small") return 0.68;
  if (value === "medium") return 1;
  if (value === "xl") return 1.6;

  return clampNumber(value, 0.65, 1.6, 1);
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) return fallback;

  return Math.min(max, Math.max(min, parsed));
}

function getTitleStyle(style: string) {
  if (style === "creatorBold") {
    return { color: "#FFF6D8", background: "#0000004D", fontWeight: "bold" };
  }

  if (style === "minimalTag") {
    return { color: "#F3E7C8", background: "#00000075", fontWeight: "bold" };
  }

  if (style === "cinematic") {
    return { color: "#F5E6BC", background: "#0000003D", fontWeight: "normal" };
  }

  if (style === "softCaption") {
    return { color: "#FFFFFF", background: "#0000008A", fontWeight: "bold" };
  }

  return { color: "#F3E7C8", background: "#00000066", fontWeight: "normal" };
}

function getTitleFontSize(title: PhaseOneTitleOverlay, width: number) {
  const base = Math.max(28, Math.round(width * 0.075));
  const scaledBase = Math.round(base * normalizeTitleScale(title.scale));

  if (title.style === "minimalTag") return Math.round(scaledBase * 0.72);
  if (title.style === "softCaption") return Math.round(scaledBase * 0.86);
  if (title.style === "cinematic") return Math.round(scaledBase * 0.92);
  if (title.style === "creatorBold") return Math.round(scaledBase * 1.12);
  return scaledBase;
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
