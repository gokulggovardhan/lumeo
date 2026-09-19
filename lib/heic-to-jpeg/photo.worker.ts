import createLibHeif from "libheif-js/libheif-wasm/libheif-bundle.mjs";
import * as exifr from "exifr";
import { inspectContainerIdentifiers, inspectHeifStructure } from "./inspection/bmff.ts";
import { inspectAaeXml } from "./inspection/aae.ts";
import { photoExtension } from "./inspection/names.ts";
import { assessLivePhotoPairing, classifyColorSafety, jpegQuality, orientationTransform, selectPrimary, type LiveState, type PhotoEvidence, type PhotoStatus } from "./pipeline.ts";

type Input = { source: File; companions: File[]; quality: number };
function stage(status: PhotoStatus) { self.postMessage({ status }); }
class PhotoFailure extends Error {}
const fail = (message: string): never => { throw new PhotoFailure(message); };
const MAX_PIXELS = 64_000_000; // RGBA alone consumes 256 MB here, before decoder and canvas copies.
function dimensions(width: number, height: number) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width * height > MAX_PIXELS) fail("This photo exceeds this browser's safe decoding budget. Try a smaller export.");
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

async function inspectMov(source: File, companion: File, sourceIdentifiers: string[]): Promise<{ state: LiveState; valid: boolean }> {
  const windowSize = 2 * 1024 * 1024;
  const head = new Uint8Array(await companion.slice(0, windowSize).arrayBuffer());
  const tailStart = Math.max(head.byteLength, companion.size - windowSize);
  const tail = tailStart < companion.size ? new Uint8Array(await companion.slice(tailStart).arrayBuffer()) : new Uint8Array(0);
  const evidenceBytes = new Uint8Array(head.byteLength + tail.byteLength);
  evidenceBytes.set(head);
  evidenceBytes.set(tail, head.byteLength);
  const valid = head.byteLength >= 12 && ascii(head, 4, 4) === "ftyp";
  const companionIdentity = inspectContainerIdentifiers(evidenceBytes);
  const companionIdentifiers = companionIdentity.keys.length > 0 ? companionIdentity.identifiers : [];
  const sourceTime = Number.isFinite(source.lastModified) && source.lastModified > 0 ? source.lastModified : null;
  const companionTime = Number.isFinite(companion.lastModified) && companion.lastModified > 0 ? companion.lastModified : null;
  const modifiedDeltaMs = sourceTime !== null && companionTime !== null ? Math.abs(sourceTime - companionTime) : undefined;
  return { state: assessLivePhotoPairing({ validQuickTime: valid, sourceIdentifiers, companionIdentifiers, modifiedDeltaMs }), valid };
}

self.onmessage = async ({ data }: MessageEvent<Input>) => {
  try {
    stage("inspecting");
    if (data.source.size > 128 * 1024 * 1024) fail("This photo is too large to decode safely in this browser.");
    let bytes = new Uint8Array(await data.source.arrayBuffer());
    const jpeg = [".jpg", ".jpeg"].includes(photoExtension(data.source.name));
    const structure = jpeg ? null : inspectHeifStructure(bytes);
    if (jpeg && !(bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)) fail("This file is not a readable JPEG photo.");
    if (structure && (["failed", "unsupported"].includes(structure.inspectionStatus) || structure.primaryItemId === null)) fail("This HEIC container is damaged or unsupported. Try exporting the photo again.");
    const evidence: PhotoEvidence = { hdr: false, depth: false, edit: "unknown", live: "unknown", notices: [] };
    const sourceIdentity = inspectContainerIdentifiers(bytes);
    const sourceIdentifiers = sourceIdentity.keys.length > 0 ? sourceIdentity.identifiers : [];
    if (structure) {
      evidence.hdr = structure.auxiliaryImages.some((item) => /hdr|gainmap/i.test(item.auxiliaryType)) || structure.evidence.some((item) => /HDR identifier/.test(item));
      evidence.depth = structure.auxiliaryImages.some((item) => /depth|disparity|portrait/i.test(item.auxiliaryType));
      // This binding supplies 8-bit RGBA. Reject HDR-only transfer functions rather than treating PQ/HLG code values as sRGB.
      if (classifyColorSafety(structure.colorProfiles) === "hdr-unsupported") fail("This HDR-only encoding needs a compatible SDR export from Photos. Gain-map reconstruction is not available yet.");
      if (evidence.hdr) evidence.notices.push("HDR auxiliary data detected. The standard still is exported; HDR gain maps are not reconstructed.");
      if (evidence.depth) evidence.notices.push("Depth data detected. The visible primary still is used; depth is not re-rendered.");
    }
    const aaeCompanions = data.companions.filter((file) => photoExtension(file.name) === ".aae");
    if (aaeCompanions.length > 1) evidence.notices.push("Multiple Apple edit companions were retained. Only the first deterministic match was inspected.");
    for (const companion of data.companions) {
      if (photoExtension(companion.name) === ".aae") {
        if (companion !== aaeCompanions[0]) continue;
        evidence.edit = "sidecar-present";
        if (companion.size > 1024 * 1024) {
          evidence.edit = "malformed-sidecar";
          evidence.notices.push("The Apple edit companion exceeds the safe inspection limit and was not parsed.");
        } else {
          const aae = inspectAaeXml(await companion.text());
          evidence.adjustmentFormat = aae.adjustmentFormat;
          evidence.adjustmentVersion = aae.adjustmentVersion;
          evidence.edit = aae.parseStatus === "parsed"
            ? (aae.detectedOperations.length > 0 || aae.adjustmentFormat ? "unsupported-sidecar" : "sidecar-present")
            : "malformed-sidecar";
          if (aae.parseStatus !== "parsed") evidence.notices.push("The Apple edit companion could not be read safely.");
        }
        evidence.notices.push("Apple edit companion detected. This version converts the selected image itself; companion edits are not applied.");
      } else if (photoExtension(companion.name) === ".mov") {
        const pairing = await inspectMov(data.source, companion, sourceIdentifiers);
        if (pairing.state === "confirmed" || (pairing.state === "probable" && evidence.live === "unknown")) evidence.live = pairing.state;
        evidence.notices.push(pairing.state === "confirmed"
          ? "A matching Apple content identifier confirms a Live Photo companion. Only the still is converted."
          : pairing.state === "probable"
            ? "A valid motion companion with a nearby timestamp is probably part of this Live Photo. Only the still is converted."
            : pairing.valid
              ? "A same-named video was retained, but Live Photo pairing could not be verified. Only the still is converted."
              : "A same-named MOV file was retained, but it is not a recognized QuickTime container and was not treated as a Live Photo.");
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
        let rgba = new Uint8ClampedArray(width * height * 4);
        for (let y = 0; y < height; y++) rgba.set(channel!.data.subarray(y * stride, y * stride + width * 4), y * width * 4);
        stage("processing");
        canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext("2d", { colorSpace: "srgb" });
        if (!ctx) fail("The browser could not allocate the image canvas.");
        let displayP3 = classifyColorSafety(structure?.colorProfiles ?? []) === "display-p3";
        if (!displayP3 && structure?.colorProfiles.some((profile) => profile.type === "prof" || profile.type === "rICC")) {
          try {
            const profile: unknown = await exifr.parse(bytes, { icc: true, gps: false, pick: ["ProfileDescription"] });
            displayP3 = Boolean(profile && typeof profile === "object" && "ProfileDescription" in profile && /display\s*p3/i.test(String(profile.ProfileDescription)));
          } catch { /* Unrecognized profiles remain an explicit capability limitation. */ }
        }
        // Canvas performs the identified Display P3 -> sRGB conversion, without invented gain-map edits.
        ctx!.putImageData(new ImageData(rgba, width, height, { colorSpace: displayP3 ? "display-p3" : "srgb" }), 0, 0);
        rgba = new Uint8ClampedArray(0);
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
    bytes = new Uint8Array(0);
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
