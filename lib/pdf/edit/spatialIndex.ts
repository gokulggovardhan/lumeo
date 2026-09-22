import type { PercentBox } from "./coordinateMapper.ts";

export type SpatialItem = {
  box: PercentBox;
};

/**
 * Small uniform-grid spatial index for page overlays.
 *
 * Percent space makes the index independent from zoom/raster scale. A page is
 * divided into fixed cells; boxes are inserted into every cell they touch.
 * Query results preserve source order, and topmostAt() deliberately returns
 * the last source item, matching Edit PDF's existing overlay hit-test rule.
 */
export class PercentSpatialIndex<T extends SpatialItem> {
  private readonly buckets = new Map<string, number[]>();
  private readonly items: readonly T[];
  private readonly cellSizePct: number;

  constructor(items: readonly T[], cellSizePct = 5) {
    if (!Number.isFinite(cellSizePct) || cellSizePct <= 0 || cellSizePct > 100) {
      throw new Error("Spatial-index cell size must be within (0, 100].");
    }
    this.items = items;
    this.cellSizePct = cellSizePct;
    items.forEach((item, index) => this.insert(index, item.box));
  }

  private cell(value: number) {
    return Math.floor(value / this.cellSizePct);
  }

  private key(x: number, y: number) {
    return `${x},${y}`;
  }

  private insert(index: number, box: PercentBox) {
    const minX = this.cell(box.xPct);
    const maxX = this.cell(box.xPct + Math.max(0, box.widthPct));
    const minY = this.cell(box.yPct);
    const maxY = this.cell(box.yPct + Math.max(0, box.heightPct));

    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        const key = this.key(x, y);
        const bucket = this.buckets.get(key);
        if (bucket) bucket.push(index);
        else this.buckets.set(key, [index]);
      }
    }
  }

  queryPoint(xPct: number, yPct: number): T[] {
    const bucket = this.buckets.get(this.key(this.cell(xPct), this.cell(yPct))) ?? [];
    const results: T[] = [];
    for (const index of bucket) {
      const item = this.items[index];
      const { box } = item;
      if (
        xPct >= box.xPct &&
        xPct <= box.xPct + box.widthPct &&
        yPct >= box.yPct &&
        yPct <= box.yPct + box.heightPct
      ) {
        results.push(item);
      }
    }
    return results;
  }

  topmostAt(xPct: number, yPct: number): T | null {
    const hits = this.queryPoint(xPct, yPct);
    return hits.length > 0 ? hits[hits.length - 1] : null;
  }

  queryBox(box: PercentBox): T[] {
    const minX = this.cell(box.xPct);
    const maxX = this.cell(box.xPct + Math.max(0, box.widthPct));
    const minY = this.cell(box.yPct);
    const maxY = this.cell(box.yPct + Math.max(0, box.heightPct));
    const candidateIndices = new Set<number>();

    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        for (const index of this.buckets.get(this.key(x, y)) ?? []) {
          candidateIndices.add(index);
        }
      }
    }

    return [...candidateIndices]
      .sort((a, b) => a - b)
      .map((index) => this.items[index])
      .filter((item) => {
        const candidate = item.box;
        return !(
          candidate.xPct + candidate.widthPct < box.xPct ||
          box.xPct + box.widthPct < candidate.xPct ||
          candidate.yPct + candidate.heightPct < box.yPct ||
          box.yPct + box.heightPct < candidate.yPct
        );
      });
  }
}
