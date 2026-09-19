import { createStorageServerClient } from "@/lib/supabase/storageServerClient";
import { WORD_TO_PDF_BUCKET } from "@/lib/supabase/wordToPdfStorage";

export const WORD_TO_PDF_STALE_CUTOFF_MS = 2 * 60 * 60 * 1000;
export const WORD_TO_PDF_CLEANUP_LIST_LIMIT = 1000;

type CleanupStorageObject = {
  name: string;
  created_at?: string | null;
};

export type WordToPdfCleanupResult = {
  scanned: number;
  removed: number;
};

export class WordToPdfCleanupError extends Error {
  constructor(
    public readonly stage: "list" | "remove",
    detail: string,
  ) {
    super(`Word-to-PDF cleanup ${stage} failed: ${detail}`);
    this.name = "WordToPdfCleanupError";
  }
}

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

export async function cleanupWordToPdfUploads(
  nowMs = Date.now(),
): Promise<WordToPdfCleanupResult> {
  const supabase = createStorageServerClient();
  const { data, error } = await supabase.storage
    .from(WORD_TO_PDF_BUCKET)
    .list("", {
      limit: WORD_TO_PDF_CLEANUP_LIST_LIMIT,
      sortBy: { column: "created_at", order: "asc" },
    });

  if (error) {
    throw new WordToPdfCleanupError("list", error.message);
  }

  const stale = selectStaleWordToPdfObjectNames(data, nowMs);

  if (stale.length === 0) {
    return { scanned: data.length, removed: 0 };
  }

  const { error: removeError } = await supabase.storage
    .from(WORD_TO_PDF_BUCKET)
    .remove(stale);

  if (removeError) {
    throw new WordToPdfCleanupError("remove", removeError.message);
  }

  return { scanned: data.length, removed: stale.length };
}
