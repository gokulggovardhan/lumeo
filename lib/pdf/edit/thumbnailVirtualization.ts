export const THUMBNAIL_VIRTUALIZE_AFTER = 60;
export const THUMBNAIL_ROW_HEIGHT_PX = 148;
export const THUMBNAIL_OVERSCAN_ROWS = 5;

export type ThumbnailWindow = {
  virtualized: boolean;
  startIndex: number;
  endIndexExclusive: number;
  topSpacerPx: number;
  bottomSpacerPx: number;
  indices: readonly number[];
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Computes presentation-only page-rail virtualization.
 *
 * The complete PDF/page model remains authoritative. This helper controls
 * only which thumbnail DOM nodes and raster jobs are materialized.
 */
export function computeThumbnailWindow({
  pageCount,
  scrollTop,
  viewportHeight,
  rowHeight = THUMBNAIL_ROW_HEIGHT_PX,
  overscanRows = THUMBNAIL_OVERSCAN_ROWS,
  virtualizeAfter = THUMBNAIL_VIRTUALIZE_AFTER,
}: {
  pageCount: number;
  scrollTop: number;
  viewportHeight: number;
  rowHeight?: number;
  overscanRows?: number;
  virtualizeAfter?: number;
}): ThumbnailWindow {
  const count = Math.max(0, Math.floor(pageCount));
  if (count === 0) {
    return {
      virtualized: false,
      startIndex: 0,
      endIndexExclusive: 0,
      topSpacerPx: 0,
      bottomSpacerPx: 0,
      indices: [],
    };
  }

  const safeRowHeight =
    Number.isFinite(rowHeight) && rowHeight > 0
      ? rowHeight
      : THUMBNAIL_ROW_HEIGHT_PX;
  const safeViewportHeight =
    Number.isFinite(viewportHeight) && viewportHeight > 0
      ? viewportHeight
      : safeRowHeight * 8;
  const safeScrollTop =
    Number.isFinite(scrollTop) && scrollTop > 0 ? scrollTop : 0;
  const safeOverscan = Math.max(0, Math.floor(overscanRows));

  if (count <= Math.max(1, Math.floor(virtualizeAfter))) {
    return {
      virtualized: false,
      startIndex: 0,
      endIndexExclusive: count,
      topSpacerPx: 0,
      bottomSpacerPx: 0,
      indices: Array.from({ length: count }, (_, index) => index),
    };
  }

  const firstVisible = clamp(
    Math.floor(safeScrollTop / safeRowHeight),
    0,
    count - 1,
  );
  const visibleRows = Math.max(
    1,
    Math.ceil(safeViewportHeight / safeRowHeight),
  );
  const startIndex = clamp(firstVisible - safeOverscan, 0, count);
  const endIndexExclusive = clamp(
    firstVisible + visibleRows + safeOverscan,
    startIndex,
    count,
  );

  return {
    virtualized: true,
    startIndex,
    endIndexExclusive,
    topSpacerPx: startIndex * safeRowHeight,
    bottomSpacerPx: (count - endIndexExclusive) * safeRowHeight,
    indices: Array.from(
      { length: endIndexExclusive - startIndex },
      (_, offset) => startIndex + offset,
    ),
  };
}

export function scrollTopForThumbnail({
  pageIndex,
  viewportHeight,
  rowHeight = THUMBNAIL_ROW_HEIGHT_PX,
}: {
  pageIndex: number;
  viewportHeight: number;
  rowHeight?: number;
}): number {
  const safeRowHeight =
    Number.isFinite(rowHeight) && rowHeight > 0
      ? rowHeight
      : THUMBNAIL_ROW_HEIGHT_PX;
  const safeViewportHeight =
    Number.isFinite(viewportHeight) && viewportHeight > 0
      ? viewportHeight
      : safeRowHeight;
  const index = Math.max(0, Math.floor(pageIndex));
  return Math.max(
    0,
    index * safeRowHeight -
      Math.max(0, (safeViewportHeight - safeRowHeight) / 2),
  );
}
