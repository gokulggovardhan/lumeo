import createLibHeif from "libheif-js/libheif-wasm/libheif-bundle.mjs";
import * as exifr from "exifr";
import { inspectHeifStructure } from "./inspection/bmff.ts";
import { inspectAaeXml } from "./inspection/aae.ts";
import { photoExtension } from "./inspection/names.ts";
import { jpegQuality, orientationTransform, selectPrimary, type PhotoEvidence, type PhotoStatus } from "./pipeline.ts";

type Input = { source: File; companions: File[]; quality: number };
function stage(status: PhotoStatus) { self.postMessage({ status }); }
class PhotoFailure extends Error {}
const fail = (message: string): never => { throw new PhotoFailure(message); };
const MAX_PIXELS = 64_000_000; // RGBA alone consumes 256 MB here, before decoder and canvas copies.
function dimensions(width: number, height: number) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width * height > MAX_PIXELS) fail("This photo exceeds this browser's safe decoding budget. Try a smaller export.");
}

self.onmessage = async ({ data }: MessageEvent<Input>) => {
  try {
    stage("inspecting");
    if (data.source.size > 128 * 1024 * 1024) fail("This photo is too large to decode safely in this browser.");
    const bytes = new Uint8Array(await data.source.arrayBuffer());
    const jpeg = [".jpg", ".jpeg"].includes(photoExtension(data.source.name));
    const structure = jpeg ? null : inspectHeifStructure(bytes);
    if (jpeg && !(bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)) fail("This file is not a readable JPEG photo.");
    if (structure && (["failed", "unsupported"].includes(structure.inspectionStatus) || structure.primaryItemId === null)) fail("This HEIC container is damaged or unsupported. Try exporting the photo again.");
    const evidence: PhotoEvidence = { hdr: false, depth: false, edit: "unknown", live: "unknown", notices: [] };
    if (structure) {
      evidence.hdr = structure.auxiliaryImages.some((item) => /hdr|gainmap/i.test(item.auxiliaryType)) || structure.evidence.some((item) => /HDR identifier/.test(item));
      evidence.depth = structure.auxiliaryImages.some((item) => /depth|disparity|portrait/i.test(item.auxiliaryType));
      // This binding supplies 8-bit RGBA. Reject HDR-only transfer functions rather than treating PQ/HLG code values as sRGB.
      if (structure.colorProfiles.some((profile) => [16, 18].includes(Number(profile.transferCharacteristics)))) fail("This HDR-only encoding needs a compatible SDR export from Photos. Gain-map reconstruction is not available yet.");
      if (evidence.hdr) evidence.notices.push("HDR auxiliary data detected. The standard still is exported; HDR gain maps are not reconstructed.");
      if (evidence.depth) evidence.notices.push("Depth data detected. The visible primary still is used; depth is not re-rendered.");
    }
    for (const companion of data.companions) {
      if (photoExtension(companion.name) === ".aae") {
        evidence.edit = "unsupported-sidecar";
        if (companion.size <= 1024 * 1024) {
          const aae = inspectAaeXml(await companion.text());
          evidence.adjustmentFormat = aae.adjustmentFormat;
          evidence.adjustmentVersion = aae.adjustmentVersion;
          if (aae.parseStatus !== "parsed") evidence.notices.push("The edit companion could not be read safely.");
        }
        evidence.notices.push("Apple edit companion detected. This version converts the selected image itself; companion edits are not applied.");
      } else if (photoExtension(companion.name) === ".mov") {
        evidence.live = "probable-pair";
        evidence.notices.push("A motion companion shares this name. Pairing is probable, not verified by an Apple identifier. Only the still is converted.");
      }
    }
    stage("decoding");
    let canvas: OffscreenCanvas;
    if (typeof OffscreenCanvas === "undefined") fail("This browser needs an update for local photo conversion. Try current Safari, Chrome, Firefox or Edge.");
    if (jpeg) {
      const bitmap = await createImageBitmap(data.source, { imageOrientation: "from-image" });
      try {
        dimensions(bitmap.width, bitmap.height);
        canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext("2d", { colorSpace: "srgb" });
        if (!ctx) fail("The browser could not allocate the image canvas.");
        ctx!.drawImage(bitmap, 0, 0);
      } finally { bitmap.close(); }
    } else {
      const lib = await createLibHeif({ print: () => {}, printErr: () => {} });
      const decoder = new lib.HeifDecoder();
      const images = decoder.decode(bytes);
      let decoded: Awaited<ReturnType<typeof lib.heif_js_decode_image2>> | undefined;
      try {
        const primary = selectPrimary(images);
        dimensions(primary.get_width(), primary.get_height());
        decoded = await lib.heif_js_decode_image2(primary.handle, lib.heif_colorspace.heif_colorspace_RGB, lib.heif_chroma.heif_chroma_interleaved_RGBA);
        if (!decoded || decoded.code) fail("This HEIC photo could not be decoded. Try a compatible export from Photos.");
        const channel = decoded.channels.find((item) => item.id === lib.heif_channel.heif_channel_interleaved);
        if (!channel) fail("The decoder did not return a usable primary image.");
        const { width, height, stride } = channel!;
        dimensions(width, height);
        const rgba = new Uint8ClampedArray(width * height * 4);
        for (let y = 0; y < height; y++) rgba.set(channel!.data.subarray(y * stride, y * stride + width * 4), y * width * 4);
        stage("processing");
        canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext("2d", { colorSpace: "srgb" });
        if (!ctx) fail("The browser could not allocate the image canvas.");
        let displayP3 = structure?.colorProfiles.some((profile) => Number(profile.colorPrimaries) === 12 && Number(profile.transferCharacteristics) === 13) ?? false;
        if (!displayP3 && structure?.colorProfiles.some((profile) => profile.type === "prof" || profile.type === "rICC")) {
          try {
            const profile: unknown = await exifr.parse(bytes, { icc: true, gps: false, pick: ["ProfileDescription"] });
            displayP3 = Boolean(profile && typeof profile === "object" && "ProfileDescription" in profile && /display\s*p3/i.test(String(profile.ProfileDescription)));
          } catch { /* Unrecognized profiles remain an explicit capability limitation. */ }
        }
        // Canvas performs the identified Display P3 -> sRGB conversion, without invented gain-map edits.
        ctx!.putImageData(new ImageData(rgba, width, height, { colorSpace: displayP3 ? "display-p3" : "srgb" }), 0, 0);
        // libheif applies container irot/imir/clap. EXIF is only a fallback when no container transform exists.
        let orientation = 1;
        if (!structure?.orientation.length) {
          try { orientation = await exifr.orientation(bytes) ?? 1; } catch { /* Optional EXIF cannot prevent conversion. */ }
        }
        if (orientation > 1 && orientation <= 8) {
          const rotated = new OffscreenCanvas(orientation >= 5 ? height : width, orientation >= 5 ? width : height);
          const target = rotated.getContext("2d", { colorSpace: "srgb" });
          if (!target) fail("The browser could not orient this image.");
          target!.setTransform(...orientationTransform(orientation, width, height));
          target!.drawImage(canvas, 0, 0);
          canvas.width = canvas.height = 1;
          canvas = rotated;
        }
        if (structure?.colorProfiles.some((profile) => profile.type === "prof" || profile.type === "rICC" || Number(profile.colorPrimaries) !== 1)) evidence.notices.push("Wide-gamut color accuracy depends on the decoder. Exact Apple Photos color parity has not been validated.");
      } finally {
        if (decoded?.image) lib.heif_image_release(decoded.image);
        for (const image of images) image.free();
        if (decoder.decoder) lib.heif_context_free(decoder.decoder);
      }
    }
    stage("encoding");
    const width = canvas!.width, height = canvas!.height;
    let blob: Blob;
    try { blob = await canvas!.convertToBlob({ type: "image/jpeg", quality: jpegQuality(data.quality) }); }
    finally { canvas!.width = canvas!.height = 1; }
    const signature = new Uint8Array(await blob!.slice(0, 3).arrayBuffer());
    if (blob!.type !== "image/jpeg" || signature[0] !== 255 || signature[1] !== 216 || signature[2] !== 255) fail("JPEG encoding failed. Try fewer photos or restart the browser.");
    self.postMessage({ status: "done", blob: blob!, width, height, evidence });
  } catch (error) {
    // Only our curated errors leave the worker; decoder exceptions can contain metadata.
    const message = error instanceof PhotoFailure ? error.message : "This photo could not be converted. It may be corrupt, unsupported, or exceed available browser memory.";
    self.postMessage({ status: "failed", message });
  }
};
