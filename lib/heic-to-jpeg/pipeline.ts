import { normalizeBasename, photoExtension } from "./inspection/names.ts";

export const PHOTO_ACCEPT = ".heic,.heif,.jpg,.jpeg,.aae,.mov,.dng";
export type PhotoStatus = "queued" | "inspecting" | "decoding" | "processing" | "encoding" | "done" | "failed" | "needs-review";
export type EditState = "baked-current" | "sidecar-present" | "interpretable-sidecar" | "unsupported-sidecar" | "malformed-sidecar" | "unknown";
export type LiveState = "confirmed" | "probable" | "unknown";
export type PhotoAsset<T extends { name: string }> = {
  id: string; name: string; source?: T; companions: T[]; warning?: string; outputName: string;
};
export type PhotoEvidence = {
  hdr: boolean; depth: boolean; edit: EditState; live: LiveState;
  notices: string[]; adjustmentFormat?: string | null; adjustmentVersion?: string | null;
};

export function jpegName(name: string): string {
  const leaf = name.split(/[\\/]/).pop() ?? name;
  return `${leaf.slice(0, leaf.length - photoExtension(leaf).length).replace(/[\x00-\x1f<>:"|?*]/g, "_") || "photo"}.jpg`;
}
export function jpegQuality(value: number): number { return value === 96 ? 0.96 : value === 85 ? 0.85 : 0.92; }
export function isPhoto(name: string): boolean { return [".heic", ".heif", ".jpg", ".jpeg"].includes(photoExtension(name)); }
export function dimensionsPreserved(sourceWidth: number, sourceHeight: number, outputWidth: number, outputHeight: number): boolean {
  return (sourceWidth === outputWidth && sourceHeight === outputHeight)
    || (sourceWidth === outputHeight && sourceHeight === outputWidth);
}

function compareCompanions<T extends { name: string; size?: number; lastModified?: number }>(left: T, right: T): number {
  return photoExtension(left.name).localeCompare(photoExtension(right.name))
    || left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
    || (left.lastModified ?? 0) - (right.lastModified ?? 0)
    || (left.size ?? 0) - (right.size ?? 0);
}

export function groupPhotos<T extends { name: string; webkitRelativePath?: string; size?: number; lastModified?: number }>(files: T[]): { assets: PhotoAsset<T>[]; ignored: number } {
  const groups = new Map<string, T[]>();
  let ignored = 0;
  for (const file of files) {
    const path = file.webkitRelativePath || file.name;
    if (/(^|[\\/])(__MACOSX|\._[^\\/]*)($|[\\/])/.test(path)) { ignored++; continue; }
    // A directory is part of the identity: exports from separate folders must not cross-pair.
    const parent = path.replace(/[^\\/]+$/, "").normalize("NFC").toUpperCase();
    const key = parent + normalizeBasename(file.name);
    groups.set(key, [...(groups.get(key) ?? []), file]);
  }
  const assets: PhotoAsset<T>[] = [];
  const usedNames = new Set<string>();
  for (const [key, members] of groups) {
    const photos = members.filter((file) => isPhoto(file.name));
    const companions = members.filter((file) => [".aae", ".mov"].includes(photoExtension(file.name))).sort(compareCompanions);
    const unsupported = members.filter((file) => !isPhoto(file.name) && !companions.includes(file));
    const duplicateSidecars = companions.filter((file) => photoExtension(file.name) === ".aae").length > 1;
    for (const source of photos) {
      let outputName = jpegName(source.name);
      let suffix = 2;
      while (usedNames.has(outputName.toLowerCase())) outputName = jpegName(source.name).replace(/\.jpg$/, ` (${suffix++}).jpg`);
      usedNames.add(outputName.toLowerCase());
      assets.push({ id: `${key}:${assets.length}`, name: source.name, source, companions: photos.length === 1 ? companions : [], outputName,
        warning: [photos.length > 1 ? "Multiple still exports share this name. Each is kept separately; companions need review." : "", duplicateSidecars ? "Multiple edit companions were supplied. They are retained, but only the first deterministic match is inspected." : ""].filter(Boolean).join(" ") || undefined });
    }
    if (!photos.length || photos.length > 1) for (const file of companions) assets.push({ id: `${key}:${assets.length}`, name: file.name, companions: [file], outputName: "", warning: "No unambiguous still image to pair with this companion. It will not be converted." });
    for (const file of unsupported) assets.push({ id: `${key}:${assets.length}`, name: file.name, companions: [file], outputName: "", warning: photoExtension(file.name) === ".dng" ? "Apple ProRAW / DNG conversion is not supported yet." : "Unsupported file. Choose HEIC, HEIF or JPEG photos." });
  }
  return { assets, ignored };
}

/** Limits decoded working sets; inputs remain lazy File references until a slot opens. */
export async function runPhotoQueue<T>(items: T[], concurrency: number, work: (item: T) => Promise<void>, failed: (item: T, error: unknown) => void, signal?: AbortSignal): Promise<void> {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(items.length, Math.max(1, Math.min(2, Math.floor(concurrency) || 1))) }, async () => {
    while (!signal?.aborted) {
      const index = next++;
      if (index >= items.length) return;
      try { await work(items[index]); } catch (error) { if (!signal?.aborted) failed(items[index], error); }
    }
  }));
}

export function releasePhotoUrls(urls: Iterable<string>, revoke: (url: string) => void = URL.revokeObjectURL): void {
  for (const url of urls) revoke(url);
}

export function selectPrimary<T extends { is_primary(): boolean }>(images: T[]): T {
  const primary = images.filter((image) => image.is_primary());
  if (primary.length !== 1) throw new Error("The primary photo could not be identified safely.");
  return primary[0];
}

export type ColorSafety = "srgb" | "display-p3" | "hdr-unsupported" | "unknown";
export function classifyColorSafety(profiles: Array<Record<string, string | number | boolean>>): ColorSafety {
  if (profiles.some((profile) => [16, 18].includes(Number(profile.transferCharacteristics)))) return "hdr-unsupported";
  if (profiles.some((profile) => Number(profile.colorPrimaries) === 12 && Number(profile.transferCharacteristics) === 13)) return "display-p3";
  if (profiles.some((profile) => Number(profile.colorPrimaries) === 1)) return "srgb";
  return "unknown";
}

export function assessLivePhotoPairing(input: {
  validQuickTime: boolean;
  sourceIdentifiers: string[];
  companionIdentifiers: string[];
  modifiedDeltaMs?: number;
}): LiveState {
  if (!input.validQuickTime) return "unknown";
  const source = new Set(input.sourceIdentifiers.map((value) => value.toLowerCase()));
  if (input.companionIdentifiers.some((value) => source.has(value.toLowerCase()))) return "confirmed";
  if (input.sourceIdentifiers.length > 0 && input.companionIdentifiers.length > 0) return "unknown";
  return input.modifiedDeltaMs !== undefined && input.modifiedDeltaMs <= 5 * 60_000 ? "probable" : "unknown";
}

export function orientationTransform(orientation: number, width: number, height: number): [number, number, number, number, number, number] {
  return ({ 2: [-1, 0, 0, 1, width, 0], 3: [-1, 0, 0, -1, width, height], 4: [1, 0, 0, -1, 0, height],
    5: [0, 1, 1, 0, 0, 0], 6: [0, 1, -1, 0, height, 0], 7: [0, -1, -1, 0, height, width], 8: [0, -1, 1, 0, 0, width] } as Record<number, [number, number, number, number, number, number]>)[orientation] ?? [1, 0, 0, 1, 0, 0];
}
