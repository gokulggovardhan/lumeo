export type ConversionKind = "word-to-pdf" | "pdf-to-word";

export type ConversionProcessingLocation = "browser" | "server";

export type ConversionPhase =
  | "preparing"
  | "uploading"
  | "converting"
  | "finalizing";

export type ConversionProgress = {
  phase: ConversionPhase;
  message: string;
};

export type ConversionInput = {
  file: File;
};

export type ConversionResult = {
  blob: Blob;
  fileName: string;
  mimeType: string;
  metadata: {
    processingLocation: ConversionProcessingLocation;
    engineId: string;
  };
};

export type ConversionOptions = {
  onProgress?: (progress: ConversionProgress) => void;
};

export interface ConversionEngine {
  readonly id: string;
  readonly kind: ConversionKind;
  readonly processingLocation: ConversionProcessingLocation;

  convert(
    input: ConversionInput,
    options: ConversionOptions,
    signal: AbortSignal,
  ): Promise<ConversionResult>;
}
