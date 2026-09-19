import { readFile } from "node:fs/promises";
import { inspectAaeXml, noAaeEvidence } from "./aae.ts";
import { findAsciiEvidence, inspectContainerIdentifiers, inspectHeifStructure } from "./bmff.ts";
import { observedSignature, publicSourceFile } from "./files.ts";
import { inspectMetadata } from "./metadata.ts";
import type { AaeEvidence, AssetGroup, Confidence, GroupReport, HeifEvidence, LocalMetadata, SourceFile } from "./types.ts";

const MAX_INSPECTION_FILE_BYTES = 512 * 1024 * 1024;

function unsupportedHeif(evidence: string): HeifEvidence {
  return {
    inspectionStatus: "unsupported",
    brands: [],
    primaryItemId: null,
    imageCount: null,
    dimensions: [],
    itemTypes: [],
    auxiliaryImages: [],
    references: [],
    exifBlockPresent: null,
    colorProfiles: [],
    orientation: [],
    evidence: [evidence],
  };
}

function unsupportedMetadata(evidence: string): LocalMetadata {
  return {
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
    evidence: [evidence],
  };
}

async function safeRead(file: SourceFile, warnings: string[]): Promise<Uint8Array | null> {
  if (file.sizeBytes > MAX_INSPECTION_FILE_BYTES) {
    warnings.push(`${file.name}: skipped because it exceeds the 512 MiB diagnostic safety limit.`);
    return null;
  }
  try {
    return new Uint8Array(await readFile(file.absolutePath));
  } catch (error) {
    warnings.push(`${file.name}: could not be read (${error instanceof Error ? error.name : "UnknownError"}).`);
    return null;
  }
}

function duplicateWarnings(group: AssetGroup): string[] {
  const counts = new Map<string, number>();
  for (const file of group.files) counts.set(file.extension, (counts.get(file.extension) ?? 0) + 1);
  return [...counts.entries()].filter(([, count]) => count > 1).map(([extension, count]) => `${count} ${extension} files share this normalized basename; all were retained.`);
}

function assessHdr(heif: HeifEvidence, bytes: Uint8Array | null): GroupReport["hdr"] {
  if (!bytes || heif.inspectionStatus === "failed" || heif.inspectionStatus === "unsupported") {
    return { value: "unknown", evidence: ["No reliable HEIF structure was available for HDR assessment."], confidence: "unknown" };
  }
  const directIdentifiers = findAsciiEvidence(bytes, ["hdrgm", "hdrgainmap", "aux:hdrgainmap", "aux:gainmap"]);
  const gainMapAux = heif.auxiliaryImages.filter(({ auxiliaryType }) => /(hdr|gain.?map)/i.test(auxiliaryType));
  const hdrColor = heif.colorProfiles.filter((profile) => profile.transferCharacteristics === 16 || profile.transferCharacteristics === 18 || profile.colorPrimaries === 9);
  if (directIdentifiers.length > 0 || gainMapAux.length > 0) {
    return {
      value: "present",
      evidence: [
        ...directIdentifiers.map((identifier) => `Direct gain-map/HDR identifier observed: ${identifier}.`),
        ...gainMapAux.map(({ auxiliaryType }) => `Auxiliary image type indicates gain-map/HDR content: ${auxiliaryType}.`),
      ],
      confidence: "high",
    };
  }
  if (hdrColor.length > 0) {
    return {
      value: "present",
      evidence: hdrColor.map((profile) => `NCLX color evidence includes primaries ${String(profile.colorPrimaries)} and transfer ${String(profile.transferCharacteristics)}.`),
      confidence: "medium",
    };
  }
  const sdrProfile = heif.colorProfiles.some((profile) => typeof profile.transferCharacteristics === "number" && profile.transferCharacteristics !== 16 && profile.transferCharacteristics !== 18);
  if (heif.inspectionStatus === "complete" && heif.imageCount === 1 && heif.auxiliaryImages.length === 0 && sdrProfile) {
    return { value: "absent", evidence: ["A single image item and an explicit non-PQ/non-HLG NCLX transfer were observed, with no auxiliary image evidence."], confidence: "medium" };
  }
  return {
    value: "unknown",
    evidence: ["No direct gain-map identifier or HDR transfer-function evidence was exposed; absence cannot be proven from image count alone."],
    confidence: "low",
  };
}

function assessEdit(aae: AaeEvidence, metadata: LocalMetadata): GroupReport["editAssessment"] {
  const evidence: string[] = [];
  if (aae.present) evidence.push("An AAE companion exists.");
  if (aae.detectedOperations.length > 0) evidence.push(`AAE adjustment keys were observed: ${aae.detectedOperations.join(", ")}.`);
  if (metadata.softwareEditor) evidence.push(`Software/editor metadata is present: ${metadata.softwareEditor}.`);
  if (metadata.modificationTimestamp) evidence.push("A modification timestamp is present, but it does not prove pixel edits are baked in.");
  if (aae.classification === "possible-unbaked-delta") {
    return { value: "possibly-unbaked", evidence, confidence: "medium", manualVerificationRequired: true };
  }
  evidence.push("No trusted Apple-rendered pixel reference was supplied, so baked status cannot be established.");
  return { value: "unknown", evidence, confidence: "low", manualVerificationRequired: true };
}

function transferAssessment(signature: string, metadata: LocalMetadata): GroupReport["transferRepresentation"] {
  const evidence = [`Observed file representation: ${signature}.`];
  if (metadata.softwareEditor) evidence.push(`Software/editor metadata is present: ${metadata.softwareEditor}.`);
  evidence.push("File extensions and companions do not prove whether iOS transfer used Automatic or Keep Originals.");
  return { value: "unknown", evidence, confidence: "low" };
}

function livePhotoAssessment(
  group: AssetGroup,
  heicIdentifiers: { keys: string[]; identifiers: string[] },
  movIdentifiers: { keys: string[]; identifiers: string[] },
): GroupReport["livePhoto"] {
  const hasHeic = group.files.some((file) => file.extension === ".heic" || file.extension === ".heif");
  const hasMov = group.files.some((file) => file.extension === ".mov");
  if (!hasHeic || !hasMov) return { value: "unknown", evidence: ["A HEIC/HEIF and MOV pair was not both present."], identifiers: [], confidence: "unknown" };
  const intersection = heicIdentifiers.identifiers.filter((identifier) => movIdentifiers.identifiers.includes(identifier));
  if (intersection.length > 0) {
    return { value: "paired", evidence: [`Matching embedded identifier observed in image and MOV: ${intersection.join(", ")}.`], identifiers: intersection, confidence: "high" };
  }
  if (heicIdentifiers.identifiers.length > 0 && movIdentifiers.identifiers.length > 0) {
    return {
      value: "not-paired",
      evidence: ["Image and MOV expose identifiers, but none match; matching basename was not allowed to override the conflict."],
      identifiers: [...new Set([...heicIdentifiers.identifiers, ...movIdentifiers.identifiers])],
      confidence: "high",
    };
  }
  const modifiedTimes = group.files.filter((file) => file.extension === ".heic" || file.extension === ".heif" || file.extension === ".mov").map((file) => Date.parse(file.modifiedAt));
  const closeTimestamp = modifiedTimes.length >= 2 && Math.max(...modifiedTimes) - Math.min(...modifiedTimes) <= 5_000;
  return {
    value: "probable-pair",
    evidence: [
      "HEIC/HEIF and MOV share a normalized basename.",
      ...(closeTimestamp ? ["Filesystem modification timestamps are within five seconds."] : []),
      ...movIdentifiers.keys.map((key) => `MOV metadata key observed: ${key}.`),
      "No matching embedded asset/content identifier was available; filename evidence is not definitive.",
    ],
    identifiers: [],
    confidence: closeTimestamp || movIdentifiers.keys.length > 0 ? "medium" : "low",
  };
}

export async function inspectAssetGroup(group: AssetGroup): Promise<GroupReport> {
  const warnings = duplicateWarnings(group);
  const signature = observedSignature(group);
  const heifFile = group.files.find((file) => file.extension === ".heic" || file.extension === ".heif");
  const jpegFile = group.files.find((file) => file.extension === ".jpg" || file.extension === ".jpeg");
  const aaeFile = group.files.find((file) => file.extension === ".aae");
  const movFile = group.files.find((file) => file.extension === ".mov");

  const heifBytes = heifFile ? await safeRead(heifFile, warnings) : null;
  const metadataFile = heifFile ?? jpegFile;
  const metadataBytes = metadataFile === heifFile ? heifBytes : metadataFile ? await safeRead(metadataFile, warnings) : null;
  const movBytes = movFile ? await safeRead(movFile, warnings) : null;
  const heif = heifBytes ? inspectHeifStructure(heifBytes) : unsupportedHeif(heifFile ? "HEIF file could not be read." : "No HEIF/HEIC file was observed.");
  const metadata = metadataBytes ? await inspectMetadata(metadataBytes) : unsupportedMetadata(metadataFile ? "Metadata source file could not be read." : "No image file was available for metadata inspection.");

  let aae = noAaeEvidence();
  if (aaeFile) {
    const aaeBytes = await safeRead(aaeFile, warnings);
    aae = aaeBytes ? inspectAaeXml(new TextDecoder("utf-8", { fatal: false }).decode(aaeBytes)) : {
      ...noAaeEvidence(),
      present: true,
      parseStatus: "failed",
      evidence: ["AAE companion was present but could not be read."],
    };
  }

  const heicIdentifiers = heifBytes ? inspectContainerIdentifiers(heifBytes) : { keys: [], identifiers: [] };
  const movIdentifiers = movBytes ? inspectContainerIdentifiers(movBytes) : { keys: [], identifiers: [] };
  const livePhoto = livePhotoAssessment(group, heicIdentifiers, movIdentifiers);
  const hdr = assessHdr(heif, heifBytes);
  const editAssessment = assessEdit(aae, metadata);
  const transferRepresentation = transferAssessment(signature, metadata);
  if (heif.inspectionStatus === "failed" || metadata.inspectionStatus === "failed" || aae.parseStatus === "failed" || aae.parseStatus === "malformed") {
    warnings.push("One or more parsers could not fully inspect this group; see the associated evidence fields.");
  }
  if (signature.startsWith("orphan-")) warnings.push("Companion file has no same-basename image and was retained as an orphan group.");

  const confidenceValues: Confidence[] = [hdr.confidence, livePhoto.confidence, editAssessment.confidence, transferRepresentation.confidence];
  const confidence: Confidence = confidenceValues.includes("unknown") ? "unknown" : confidenceValues.includes("low") ? "low" : confidenceValues.includes("medium") ? "medium" : "high";
  return {
    basename: group.basename,
    files: group.files.map(publicSourceFile),
    signature,
    classificationEvidence: {
      observedExtensions: [...new Set(group.files.map((file) => file.extension))],
      normalizedBasenameRule: "Unicode NFC, trim, case-insensitive extension removal, uppercase comparison",
      sourceFilesPreserved: true,
    },
    heif,
    aae,
    livePhoto,
    hdr,
    metadata,
    editAssessment,
    transferRepresentation,
    warnings,
    confidence,
  };
}
