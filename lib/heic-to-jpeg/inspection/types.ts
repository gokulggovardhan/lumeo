export const SUPPORTED_EXTENSIONS = [".heic", ".heif", ".jpg", ".jpeg", ".aae", ".mov"] as const;

export type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number];
export type Confidence = "high" | "medium" | "low" | "unknown";
export type TernaryEvidence = "present" | "absent" | "unknown";
export type InspectionStatus = "complete" | "partial" | "unsupported" | "failed";
export type ValidationMode = "real" | "synthetic";

export type SourceFile = {
  name: string;
  relativePath: string;
  absolutePath: string;
  extension: SupportedExtension;
  sizeBytes: number;
  modifiedAt: string;
};

export type AssetGroup = {
  basename: string;
  files: SourceFile[];
};

export type HeifEvidence = {
  inspectionStatus: InspectionStatus;
  brands: string[];
  primaryItemId: number | null;
  imageCount: number | null;
  dimensions: Array<{ width: number; height: number }>;
  itemTypes: string[];
  auxiliaryImages: Array<{ auxiliaryType: string; evidence: string }>;
  references: string[];
  exifBlockPresent: boolean | null;
  colorProfiles: Array<Record<string, string | number | boolean>>;
  orientation: Array<{ rotationDegrees?: number; mirrorAxis?: "horizontal" | "vertical" }>;
  evidence: string[];
};

export type AaeEvidence = {
  present: boolean;
  parseStatus: "not-present" | "parsed" | "malformed" | "failed";
  adjustmentFormat: string | null;
  adjustmentVersion: string | null;
  adjustmentIdentifiers: string[];
  adjustmentXML: string | null;
  detectedOperations: string[];
  cropRotationEvidence: string[];
  exposureColorEvidence: string[];
  filterEvidence: string[];
  unknownAdjustments: Array<{ key: string; value: string }>;
  classification: "duplicate-of-rendered-image" | "possible-unbaked-delta" | "unknown";
  evidence: string[];
};

export type LocalMetadata = {
  inspectionStatus: InspectionStatus;
  orientation: string | number | null;
  pixelDimensions: { width: number; height: number } | null;
  captureTimestamp: string | null;
  modificationTimestamp: string | null;
  cameraModel: string | null;
  deviceManufacturer: string | null;
  lensInformation: string | null;
  gpsPresent: boolean | null;
  gpsCoordinates: { latitude: number; longitude: number } | null;
  colorProfile: string | null;
  softwareEditor: string | null;
  imageIdentifier: string | null;
  evidence: string[];
};

export type GroupReport = {
  basename: string;
  files: Array<Omit<SourceFile, "absolutePath">>;
  signature: string;
  classificationEvidence: Record<string, unknown>;
  heif: HeifEvidence;
  aae: AaeEvidence;
  livePhoto: {
    value: "paired" | "probable-pair" | "not-paired" | "unknown";
    evidence: string[];
    identifiers: string[];
    confidence: Confidence;
  };
  hdr: {
    value: TernaryEvidence;
    evidence: string[];
    confidence: Confidence;
  };
  metadata: LocalMetadata;
  editAssessment: {
    value: "baked" | "possibly-unbaked" | "unknown";
    evidence: string[];
    confidence: Confidence;
    manualVerificationRequired: boolean;
  };
  transferRepresentation: {
    value: "Automatic" | "Keep Originals" | "unknown";
    evidence: string[];
    confidence: Confidence;
  };
  warnings: string[];
  confidence: Confidence;
};

export type DecisionTableRow = {
  signature: string;
  sampleCount: number;
  percentage: number | null;
  aaeFrequency: number | null;
  hdrFrequency: number | null;
  livePhotoFrequency: number | null;
  observedEvidence: string[];
  candidateHandlingRule: string;
  confidence: Confidence;
  verificationStatus: "VERIFIED" | "UNVERIFIED";
};

export type InspectionReport = {
  schemaVersion: 1;
  generatedAt: string;
  sourceFolder: string;
  validationMode: ValidationMode;
  summary: {
    totalFiles: number;
    totalGroups: number;
    realSampleCount: number;
    signatureDistribution: Record<string, number>;
    aaeFrequency: number | null;
    livePhotoPairingRate: number | null;
    hdrDetectionRate: number | null;
    unknownClassifications: number;
    parsingFailures: number;
    phase0Gate: "PASS" | "BLOCKED";
    verificationStatus: "VERIFIED" | "UNVERIFIED";
  };
  groups: GroupReport[];
};
