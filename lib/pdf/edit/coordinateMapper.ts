// Central, deterministic coordinate conversion for Edit PDF.
//
// The editor uses two explicit page coordinate spaces:
// - percent space: 0..100 relative to the VISUAL page box, used by DOM overlays;
// - visual point space: PDF points relative to the same visual page box,
//   origin top-left, y increasing downward.
//
// Native PDF content-stream coordinates remain in the operator matrix and are
// never silently mixed with either space. Page rotation/native-space export
// continues to live behind the export/content-stream boundaries until callers
// explicitly ask for that conversion.
export type PercentPoint = { xPct: number; yPct: number };
export type PercentBox = PercentPoint & { widthPct: number; heightPct: number };
export type VisualPoint = { xPt: number; yPt: number };
export type VisualBox = VisualPoint & { widthPt: number; heightPt: number };

export class PdfCoordinateMapper {
  readonly widthPt: number;
  readonly heightPt: number;

  constructor(widthPt: number, heightPt: number) {
    if (!Number.isFinite(widthPt) || !Number.isFinite(heightPt) || widthPt <= 0 || heightPt <= 0) {
      throw new Error("Page dimensions must be finite positive PDF-point values.");
    }
    this.widthPt = widthPt;
    this.heightPt = heightPt;
  }

  percentPointToVisualPoint(point: PercentPoint): VisualPoint {
    return {
      xPt: (point.xPct / 100) * this.widthPt,
      yPt: (point.yPct / 100) * this.heightPt,
    };
  }

  visualPointToPercentPoint(point: VisualPoint): PercentPoint {
    return {
      xPct: (point.xPt / this.widthPt) * 100,
      yPct: (point.yPt / this.heightPt) * 100,
    };
  }

  percentBoxToVisualBox(box: PercentBox): VisualBox {
    const origin = this.percentPointToVisualPoint(box);
    return {
      ...origin,
      widthPt: (box.widthPct / 100) * this.widthPt,
      heightPt: (box.heightPct / 100) * this.heightPt,
    };
  }

  visualBoxToPercentBox(box: VisualBox): PercentBox {
    const origin = this.visualPointToPercentPoint(box);
    return {
      ...origin,
      widthPct: (box.widthPt / this.widthPt) * 100,
      heightPct: (box.heightPt / this.heightPt) * 100,
    };
  }

  screenPointToPercentPoint(
    clientX: number,
    clientY: number,
    rect: { left: number; top: number; width: number; height: number },
  ): PercentPoint | null {
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      xPct: ((clientX - rect.left) / rect.width) * 100,
      yPct: ((clientY - rect.top) / rect.height) * 100,
    };
  }

  baselineForBox(box: PercentBox, ascentRatio = 0.85): number {
    const visual = this.percentBoxToVisualBox(box);
    return visual.yPt + visual.heightPt * ascentRatio;
  }
}
