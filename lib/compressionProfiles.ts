export type CompressProfile = "highQuality" | "balanced" | "smaller";
export type ImageQuality = "high" | "balanced" | "compact";
export type ColourMode = "preserve" | "grayscale";
export type MetadataMode = "fresh" | "preserve";

export const compressionProfiles: Record<
  CompressProfile,
  {
    label: string;
    description: string;
    dpi: number;
    quality: number;
    qualityLabel: ImageQuality;
    colour: ColourMode;
    metadata: MetadataMode;
  }
> = {
  highQuality: {
    label: "High quality",
    description: "Preserves more visual detail.",
    dpi: 220,
    quality: 0.86,
    qualityLabel: "high",
    colour: "preserve",
    metadata: "preserve",
  },
  balanced: {
    label: "Balanced",
    description: "Recommended for most documents.",
    dpi: 150,
    quality: 0.74,
    qualityLabel: "balanced",
    colour: "preserve",
    metadata: "preserve",
  },
  smaller: {
    label: "Smaller file",
    description: "Prioritises a lower output size.",
    dpi: 96,
    quality: 0.58,
    qualityLabel: "compact",
    colour: "preserve",
    metadata: "preserve",
  },
};
