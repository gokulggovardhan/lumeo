import * as exifr from "exifr";
import type { LocalMetadata } from "./types.ts";

const METADATA_KEYS = [
  "Orientation",
  "ImageWidth",
  "ImageHeight",
  "ExifImageWidth",
  "ExifImageHeight",
  "PixelXDimension",
  "PixelYDimension",
  "DateTimeOriginal",
  "CreateDate",
  "ModifyDate",
  "Model",
  "Make",
  "LensModel",
  "LensInfo",
  "latitude",
  "longitude",
  "GPSLatitude",
  "GPSLongitude",
  "ColorSpace",
  "ProfileDescription",
  "Software",
  "ImageUniqueID",
  "ContentIdentifier",
  "AssetIdentifier",
] as const;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function first(source: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) if (source[key] !== undefined && source[key] !== null) return source[key];
  return null;
}

function text(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (Array.isArray(value) && value.every((entry) => typeof entry === "number" || typeof entry === "string")) return value.join(" ");
  return null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function timestamp(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  const stringValue = text(value);
  if (!stringValue) return null;
  const parsed = new Date(stringValue);
  return Number.isNaN(parsed.getTime()) ? stringValue : parsed.toISOString();
}

export async function inspectMetadata(bytes: Uint8Array): Promise<LocalMetadata> {
  const empty: LocalMetadata = {
    inspectionStatus: "unsupported",
    orientation: null,
    pixelDimensions: null,
    captureTimestamp: null,
    modificationTimestamp: null,
    cameraModel: null,
    deviceManufacturer: null,
    lensInformation: null,
    gpsPresent: null,
    gpsCoordinates: null,
    colorProfile: null,
    softwareEditor: null,
    imageIdentifier: null,
    evidence: [],
  };

  try {
    const parsed: unknown = await exifr.parse(bytes, {
      pick: [...METADATA_KEYS],
      tiff: true,
      exif: true,
      gps: true,
      xmp: true,
      icc: true,
      sanitize: true,
      mergeOutput: true,
    });
    const source = record(parsed);
    if (!source || Object.keys(source).length === 0) return { ...empty, evidence: ["No supported metadata fields were exposed by the browser-compatible parser."] };

    const width = numberValue(first(source, ["ExifImageWidth", "PixelXDimension", "ImageWidth"]));
    const height = numberValue(first(source, ["ExifImageHeight", "PixelYDimension", "ImageHeight"]));
    const latitude = numberValue(first(source, ["latitude", "GPSLatitude"]));
    const longitude = numberValue(first(source, ["longitude", "GPSLongitude"]));
    const gpsCoordinates = latitude !== null && longitude !== null ? { latitude, longitude } : null;
    const evidence = Object.keys(source).sort().map((key) => `Metadata field exposed: ${key}.`);
    return {
      inspectionStatus: "complete",
      orientation: (typeof source.Orientation === "number" || typeof source.Orientation === "string") ? source.Orientation : null,
      pixelDimensions: width !== null && height !== null ? { width, height } : null,
      captureTimestamp: timestamp(first(source, ["DateTimeOriginal", "CreateDate"])),
      modificationTimestamp: timestamp(source.ModifyDate),
      cameraModel: text(source.Model),
      deviceManufacturer: text(source.Make),
      lensInformation: text(first(source, ["LensModel", "LensInfo"])),
      gpsPresent: gpsCoordinates !== null,
      gpsCoordinates,
      colorProfile: text(first(source, ["ProfileDescription", "ColorSpace"])),
      softwareEditor: text(source.Software),
      imageIdentifier: text(first(source, ["ContentIdentifier", "AssetIdentifier", "ImageUniqueID"])),
      evidence,
    };
  } catch (error) {
    return {
      ...empty,
      inspectionStatus: "failed",
      evidence: [`Metadata parsing failed safely: ${error instanceof Error ? error.name : "UnknownError"}.`],
    };
  }
}
