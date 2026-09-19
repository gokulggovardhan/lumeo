import { createStorageServerClient } from "@/lib/supabase/storageServerClient";
import { WORD_TO_PDF_BUCKET } from "@/lib/supabase/wordToPdfStorage";
import {
  selectStaleWordToPdfObjectNames,
  WORD_TO_PDF_CLEANUP_LIST_LIMIT,
} from "@/lib/supabase/wordToPdfCleanupPolicy";

export {
  selectStaleWordToPdfObjectNames,
  WORD_TO_PDF_CLEANUP_LIST_LIMIT,
  WORD_TO_PDF_STALE_CUTOFF_MS,
} from "@/lib/supabase/wordToPdfCleanupPolicy";

export type WordToPdfCleanupResult = {
  scanned: number;
  removed: number;
};

export class WordToPdfCleanupError extends Error {
  readonly stage: "list" | "remove";

  constructor(stage: "list" | "remove", detail: string) {
    super(`Word-to-PDF cleanup ${stage} failed: ${detail}`);
    this.name = "WordToPdfCleanupError";
    this.stage = stage;
  }
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
