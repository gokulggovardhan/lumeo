import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { discoverSampleFiles, groupSampleFiles, publicSourceFile } from "./files.ts";
import { inspectAssetGroup } from "./inspect.ts";
import type { DecisionTableRow, GroupReport, InspectionReport, ValidationMode } from "./types.ts";

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : Number(((numerator / denominator) * 100).toFixed(2));
}

function parsingFailure(group: GroupReport): boolean {
  return group.heif.inspectionStatus === "failed" || group.metadata.inspectionStatus === "failed" || group.aae.parseStatus === "failed" || group.aae.parseStatus === "malformed";
}

function buildDecisionRows(groups: GroupReport[], mode: ValidationMode): DecisionTableRow[] {
  if (mode !== "real" || groups.length === 0) return [];
  const bySignature = new Map<string, GroupReport[]>();
  for (const group of groups) bySignature.set(group.signature, [...(bySignature.get(group.signature) ?? []), group]);
  return [...bySignature.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([signature, matching]) => ({
    signature,
    sampleCount: matching.length,
    percentage: ratio(matching.length, groups.length),
    aaeFrequency: ratio(matching.filter((group) => group.aae.present).length, matching.length),
    hdrFrequency: ratio(matching.filter((group) => group.hdr.value === "present").length, matching.length),
    livePhotoFrequency: ratio(matching.filter((group) => group.livePhoto.value === "paired" || group.livePhoto.value === "probable-pair").length, matching.length),
    observedEvidence: [...new Set(matching.flatMap((group) => [
      ...group.heif.evidence,
      ...group.aae.evidence,
      ...group.livePhoto.evidence,
      ...group.hdr.evidence,
    ]))].slice(0, 50),
    candidateHandlingRule: "No production handling rule is promoted in Phase 0; compare this evidence against trusted Apple renders first.",
    confidence: matching.every((group) => group.confidence === "high") ? "high" : matching.some((group) => group.confidence === "unknown") ? "unknown" : "low",
    verificationStatus: "UNVERIFIED",
  }));
}

export async function inspectSampleDirectory(options: {
  sourceFolder: string;
  outputFolder: string;
  validationMode?: ValidationMode;
}): Promise<{ report: InspectionReport; decisionTable: { verificationStatus: "UNVERIFIED"; realSampleCount: number; rows: DecisionTableRow[] } }> {
  const sourceFolder = path.resolve(options.sourceFolder);
  const outputFolder = path.resolve(options.outputFolder);
  const validationMode = options.validationMode ?? "real";
  const files = await discoverSampleFiles(sourceFolder);
  const assetGroups = groupSampleFiles(files);
  const groups: GroupReport[] = [];
  for (const group of assetGroups) {
    try {
      groups.push(await inspectAssetGroup(group));
    } catch (error) {
      groups.push({
        basename: group.basename,
        files: group.files.map(publicSourceFile),
        signature: "unknown/mixed",
        classificationEvidence: { groupInspectionFailed: true },
        heif: { inspectionStatus: "failed", brands: [], primaryItemId: null, imageCount: null, dimensions: [], itemTypes: [], auxiliaryImages: [], references: [], exifBlockPresent: null, colorProfiles: [], orientation: [], evidence: [] },
        aae: { present: group.files.some((file) => file.extension === ".aae"), parseStatus: "failed", adjustmentFormat: null, adjustmentVersion: null, adjustmentIdentifiers: [], adjustmentXML: null, detectedOperations: [], cropRotationEvidence: [], exposureColorEvidence: [], filterEvidence: [], unknownAdjustments: [], classification: "unknown", evidence: [] },
        livePhoto: { value: "unknown", evidence: [], identifiers: [], confidence: "unknown" },
        hdr: { value: "unknown", evidence: [], confidence: "unknown" },
        metadata: { inspectionStatus: "failed", orientation: null, pixelDimensions: null, captureTimestamp: null, modificationTimestamp: null, cameraModel: null, deviceManufacturer: null, lensInformation: null, gpsPresent: null, gpsCoordinates: null, colorProfile: null, softwareEditor: null, imageIdentifier: null, evidence: [] },
        editAssessment: { value: "unknown", evidence: [], confidence: "unknown", manualVerificationRequired: true },
        transferRepresentation: { value: "unknown", evidence: [], confidence: "unknown" },
        warnings: [`Group inspection failed safely (${error instanceof Error ? error.name : "UnknownError"}).`],
        confidence: "unknown",
      });
    }
  }

  const signatureDistribution = groups.reduce<Record<string, number>>((distribution, group) => {
    distribution[group.signature] = (distribution[group.signature] ?? 0) + 1;
    return distribution;
  }, {});
  const realSampleCount = validationMode === "real" ? groups.length : 0;
  const report: InspectionReport = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceFolder,
    validationMode,
    summary: {
      totalFiles: files.length,
      totalGroups: groups.length,
      realSampleCount,
      signatureDistribution,
      aaeFrequency: realSampleCount > 0 ? ratio(groups.filter((group) => group.aae.present).length, groups.length) : null,
      livePhotoPairingRate: realSampleCount > 0 ? ratio(groups.filter((group) => group.livePhoto.value === "paired" || group.livePhoto.value === "probable-pair").length, groups.length) : null,
      hdrDetectionRate: realSampleCount > 0 ? ratio(groups.filter((group) => group.hdr.value === "present").length, groups.length) : null,
      unknownClassifications: groups.filter((group) => group.editAssessment.value === "unknown" || group.transferRepresentation.value === "unknown" || group.hdr.value === "unknown").length,
      parsingFailures: groups.filter(parsingFailure).length,
      phase0Gate: "BLOCKED",
      verificationStatus: "UNVERIFIED",
    },
    groups,
  };
  const decisionTable = { verificationStatus: "UNVERIFIED" as const, realSampleCount, rows: buildDecisionRows(groups, validationMode) };
  await mkdir(outputFolder, { recursive: true });
  await writeFile(path.join(outputFolder, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(path.join(outputFolder, "decision-table.json"), `${JSON.stringify(decisionTable, null, 2)}\n`, "utf8");
  return { report, decisionTable };
}
