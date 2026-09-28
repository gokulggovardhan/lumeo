export type SearchableOcrPublicationRevision = Readonly<{
  baseBytes: ArrayBuffer;
  publishedBytes: ArrayBuffer;
  pageIndex: number;
}>;

export type SearchableOcrPublicationSource =
  | Readonly<{
      kind: "initial";
      currentBytes: ArrayBuffer;
      writerSourceBytes: ArrayBuffer;
      baseBytes: ArrayBuffer;
    }>
  | Readonly<{
      kind: "regenerate";
      currentBytes: ArrayBuffer;
      writerSourceBytes: ArrayBuffer;
      baseBytes: ArrayBuffer;
    }>;

/**
 * Decides whether searchable OCR publication is a first write or a safe
 * regeneration of a Lumeo-owned layer from this browser session.
 *
 * Regeneration is intentionally narrow. It is available only when the current
 * PDF bytes are the exact published revision previously returned by Lumeo for
 * this same page. The writer then starts from the preserved pre-layer bytes,
 * so corrected publication replaces the previous invisible layer instead of
 * appending duplicate searchable text.
 *
 * Any unrelated PDF mutation changes the ArrayBuffer revision and therefore
 * breaks ownership automatically. In that case callers must not guess which
 * content stream belongs to the OCR layer.
 */
export function resolveSearchableOcrPublicationSource({
  currentBytes,
  pageIndex,
  publication,
}: {
  currentBytes: ArrayBuffer;
  pageIndex: number;
  publication: SearchableOcrPublicationRevision | null;
}): SearchableOcrPublicationSource {
  if (
    publication &&
    publication.pageIndex === pageIndex &&
    publication.publishedBytes === currentBytes
  ) {
    return {
      kind: "regenerate",
      currentBytes,
      writerSourceBytes: publication.baseBytes,
      baseBytes: publication.baseBytes,
    };
  }

  return {
    kind: "initial",
    currentBytes,
    writerSourceBytes: currentBytes,
    baseBytes: currentBytes,
  };
}

export function bindSearchableOcrPublicationRevision({
  source,
  publishedBytes,
  pageIndex,
}: {
  source: SearchableOcrPublicationSource;
  publishedBytes: ArrayBuffer;
  pageIndex: number;
}): SearchableOcrPublicationRevision {
  if (!(publishedBytes instanceof ArrayBuffer) || publishedBytes.byteLength === 0) {
    throw new Error("A non-empty published PDF revision is required.");
  }
  if (!Number.isInteger(pageIndex) || pageIndex < 0) {
    throw new Error("Searchable OCR publication page index must be non-negative.");
  }
  return Object.freeze({
    baseBytes: source.baseBytes,
    publishedBytes,
    pageIndex,
  });
}
