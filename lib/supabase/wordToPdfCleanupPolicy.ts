export const WORD_TO_PDF_STALE_CUTOFF_MS = 2 * 60 * 60 * 1000;
export const WORD_TO_PDF_CLEANUP_LIST_LIMIT = 1000;

export type CleanupStorageObject = {
  name: string;
  created_at?: string | null;
};

export function selectStaleWordToPdfObjectNames(
  objects: CleanupStorageObject[],
  nowMs = Date.now(),
): string[] {
  const cutoff = nowMs - WORD_TO_PDF_STALE_CUTOFF_MS;

  return objects
    .filter((object) => {
      const createdAt = object.created_at ? Date.parse(object.created_at) : Number.NaN;
      // Missing/unparseable timestamps cannot represent an in-flight upload,
      // so preserve the existing fail-safe behavior and treat them as stale.
      return Number.isNaN(createdAt) || createdAt < cutoff;
    })
    .map((object) => object.name);
}
