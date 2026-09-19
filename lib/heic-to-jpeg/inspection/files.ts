import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { SUPPORTED_EXTENSIONS, type AssetGroup, type SourceFile, type SupportedExtension } from "./types.ts";
import { normalizeBasename } from "./names.ts";
export { normalizeBasename } from "./names.ts";

const supported = new Set<string>(SUPPORTED_EXTENSIONS);

export async function discoverSampleFiles(root: string): Promise<SourceFile[]> {
  const absoluteRoot = path.resolve(root);
  const discovered: SourceFile[] = [];

  async function walk(folder: string): Promise<void> {
    const entries = await readdir(folder, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolutePath = path.join(folder, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      const extension = path.extname(entry.name).toLocaleLowerCase("en-US");
      if (!supported.has(extension)) continue;
      const details = await stat(absolutePath);
      discovered.push({
        name: entry.name,
        relativePath: path.relative(absoluteRoot, absolutePath).split(path.sep).join("/"),
        absolutePath,
        extension: extension as SupportedExtension,
        sizeBytes: details.size,
        modifiedAt: details.mtime.toISOString(),
      });
    }
  }

  await walk(absoluteRoot);
  return discovered;
}

export function groupSampleFiles(files: SourceFile[]): AssetGroup[] {
  const groups = new Map<string, SourceFile[]>();
  for (const file of files) {
    const basename = normalizeBasename(file.name);
    const current = groups.get(basename) ?? [];
    current.push(file);
    groups.set(basename, current);
  }
  return [...groups.entries()]
    .map(([basename, groupedFiles]) => ({
      basename,
      files: groupedFiles.sort((left, right) => left.name.localeCompare(right.name)),
    }))
    .sort((left, right) => left.basename.localeCompare(right.basename));
}

export function publicSourceFile(file: SourceFile): Omit<SourceFile, "absolutePath"> {
  return {
    name: file.name,
    relativePath: file.relativePath,
    extension: file.extension,
    sizeBytes: file.sizeBytes,
    modifiedAt: file.modifiedAt,
  };
}

export function observedSignature(group: AssetGroup): string {
  const extensions = new Set(group.files.map((file) => file.extension));
  const hasHeic = extensions.has(".heic") || extensions.has(".heif");
  const hasJpeg = extensions.has(".jpg") || extensions.has(".jpeg");
  const hasAae = extensions.has(".aae");
  const hasMov = extensions.has(".mov");
  if (!hasHeic && !hasJpeg && hasAae && !hasMov) return "orphan-AAE";
  if (!hasHeic && !hasJpeg && !hasAae && hasMov) return "orphan-MOV";
  if (hasJpeg && !hasHeic && !hasAae && !hasMov) return "JPEG-only";
  if (hasHeic && !hasJpeg && !hasAae && !hasMov) return "HEIC-only";
  if (hasHeic && hasAae && !hasMov && !hasJpeg) return "HEIC+AAE";
  if (hasHeic && hasMov && !hasAae && !hasJpeg) return "HEIC+MOV";
  if (hasHeic && hasAae && hasMov && !hasJpeg) return "HEIC+AAE+MOV";
  if (hasHeic && hasJpeg && !hasAae && !hasMov) return "HEIC+JPEG";
  return "unknown/mixed";
}
