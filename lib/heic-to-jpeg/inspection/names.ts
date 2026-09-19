/** Shared by the local inspector and browser ingestion. Duplicate suffixes stay distinct. */
export function photoExtension(name: string): string {
  return /\.[^.\\/]+$/.exec(name)?.[0].toLowerCase() ?? "";
}

export function normalizeBasename(name: string): string {
  const leaf = name.split(/[\\/]/).pop() ?? name;
  return leaf.slice(0, leaf.length - photoExtension(leaf).length).normalize("NFC").trim().toUpperCase();
}
