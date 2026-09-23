import type {
  PdfPaintColor,
  PdfPaintColorSpace,
  TextShowOperator,
} from "./contentStream.ts";

export type NativeTextPaintOverride = {
  fillColor?: PdfPaintColor;
  strokeColor?: PdfPaintColor;
};

export type NativePaintWrapper = {
  prefix: string;
  suffix: string;
};

export type NativePaintPlan =
  | {
      editable: true;
      override: NativeTextPaintOverride;
      wrapper: NativePaintWrapper;
      reason: null;
    }
  | {
      editable: false;
      override: null;
      wrapper: null;
      reason: string;
    };

const COMPONENT_COUNTS: Readonly<Record<PdfPaintColorSpace, number>> = {
  DeviceGray: 1,
  DeviceRGB: 3,
  DeviceCMYK: 4,
};

const COMPONENT_EPSILON = 1e-6;

function formatPdfNumber(value: number): string {
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? "0" : rounded.toString();
}

function componentList(color: PdfPaintColor): string {
  return color.components.map(formatPdfNumber).join(" ");
}

export function validateNativePaintColor(color: PdfPaintColor): string | null {
  const expected = COMPONENT_COUNTS[color.colorSpace];
  if (!expected) return `Unsupported PDF paint colour space: ${color.colorSpace}.`;
  if (color.components.length !== expected) {
    return `${color.colorSpace} requires exactly ${expected} component${expected === 1 ? "" : "s"}.`;
  }
  if (
    color.components.some(
      (component) => !Number.isFinite(component) || component < 0 || component > 1,
    )
  ) {
    return "PDF paint colour components must be finite values between 0 and 1.";
  }
  return null;
}

export function paintColorFromCssHex(hex: string): PdfPaintColor | null {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!match) return null;
  return {
    colorSpace: "DeviceRGB",
    components: [
      Number.parseInt(match[1], 16) / 255,
      Number.parseInt(match[2], 16) / 255,
      Number.parseInt(match[3], 16) / 255,
    ],
    cssHex: `#${match[1]}${match[2]}${match[3]}`.toLowerCase(),
  };
}

export function paintOperator(color: PdfPaintColor, channel: "fill" | "stroke"): string {
  const validation = validateNativePaintColor(color);
  if (validation) throw new Error(validation);

  if (color.colorSpace === "DeviceGray") {
    return `${componentList(color)} ${channel === "fill" ? "g" : "G"}`;
  }
  if (color.colorSpace === "DeviceRGB") {
    return `${componentList(color)} ${channel === "fill" ? "rg" : "RG"}`;
  }
  return `${componentList(color)} ${channel === "fill" ? "k" : "K"}`;
}

function colorsEqual(a: PdfPaintColor | null | undefined, b: PdfPaintColor | null | undefined): boolean {
  if (!a || !b) return a == null && b == null;
  return (
    a.colorSpace === b.colorSpace &&
    a.components.length === b.components.length &&
    a.components.every((component, index) =>
      Math.abs(component - b.components[index]) <= COMPONENT_EPSILON,
    )
  );
}

export function paintChannelsForRenderingMode(
  renderMode: number,
): Readonly<{ fill: boolean; stroke: boolean }> {
  switch (renderMode) {
    case 0:
      return { fill: true, stroke: false };
    case 1:
      return { fill: false, stroke: true };
    case 2:
      return { fill: true, stroke: true };
    default:
      return { fill: false, stroke: false };
  }
}

/**
 * Builds a local graphics-paint wrapper for exactly one native text-show
 * operator. The selected colour is set immediately before the operator and
 * the proven original colour is restored immediately after it, so later PDF
 * content cannot inherit the user's formatting change.
 *
 * Alpha is deliberately not part of this operation. ExtGState alpha may be
 * shared with unrelated graphics and creating/restoring a new ExtGState
 * resource is a separate problem. The caller must preserve the operator's
 * existing fill/stroke opacity unchanged.
 */
export function buildNativePaintPlan(
  operator: Pick<
    TextShowOperator,
    "renderMode" | "fillColor" | "strokeColor" | "fillOpacity" | "strokeOpacity"
  >,
  requested: NativeTextPaintOverride,
): NativePaintPlan {
  if (!Number.isInteger(operator.renderMode) || operator.renderMode < 0 || operator.renderMode > 7) {
    return {
      editable: false,
      override: null,
      wrapper: null,
      reason: "This text has an invalid PDF rendering mode, so its paint state cannot be changed safely.",
    };
  }

  if (operator.renderMode >= 4) {
    return {
      editable: false,
      override: null,
      wrapper: null,
      reason:
        "This text contributes to a clipping path. Changing its paint state is disabled because the edit has higher graphics-state risk.",
    };
  }

  if (operator.renderMode === 3) {
    return {
      editable: false,
      override: null,
      wrapper: null,
      reason: "This text is invisible (rendering mode 3), so a visible colour change would not have a defined effect.",
    };
  }

  const channels = paintChannelsForRenderingMode(operator.renderMode);
  const requestedFill = requested.fillColor;
  const requestedStroke = requested.strokeColor;

  if (requestedFill && !channels.fill) {
    return {
      editable: false,
      override: null,
      wrapper: null,
      reason: "This text rendering mode does not paint glyph fills, so a fill-colour change would be a no-op.",
    };
  }
  if (requestedStroke && !channels.stroke) {
    return {
      editable: false,
      override: null,
      wrapper: null,
      reason: "This text rendering mode does not paint glyph strokes, so a stroke-colour change would be a no-op.",
    };
  }

  if (!requestedFill && !requestedStroke) {
    return {
      editable: false,
      override: null,
      wrapper: null,
      reason: "No native text paint change was requested.",
    };
  }

  for (const color of [requestedFill, requestedStroke]) {
    if (!color) continue;
    const validation = validateNativePaintColor(color);
    if (validation) {
      return { editable: false, override: null, wrapper: null, reason: validation };
    }
  }

  const before: string[] = [];
  const after: string[] = [];
  const applied: NativeTextPaintOverride = {};

  if (requestedFill && !colorsEqual(requestedFill, operator.fillColor)) {
    if (!operator.fillColor) {
      return {
        editable: false,
        override: null,
        wrapper: null,
        reason:
          "The original fill colour is unknown, so Lumeo cannot restore the surrounding PDF graphics state exactly after this edit.",
      };
    }
    const originalValidation = validateNativePaintColor(operator.fillColor);
    if (originalValidation) {
      return { editable: false, override: null, wrapper: null, reason: originalValidation };
    }
    before.push(paintOperator(requestedFill, "fill"));
    after.unshift(paintOperator(operator.fillColor, "fill"));
    applied.fillColor = requestedFill;
  }

  if (requestedStroke && !colorsEqual(requestedStroke, operator.strokeColor)) {
    if (!operator.strokeColor) {
      return {
        editable: false,
        override: null,
        wrapper: null,
        reason:
          "The original stroke colour is unknown, so Lumeo cannot restore the surrounding PDF graphics state exactly after this edit.",
      };
    }
    const originalValidation = validateNativePaintColor(operator.strokeColor);
    if (originalValidation) {
      return { editable: false, override: null, wrapper: null, reason: originalValidation };
    }
    before.push(paintOperator(requestedStroke, "stroke"));
    after.unshift(paintOperator(operator.strokeColor, "stroke"));
    applied.strokeColor = requestedStroke;
  }

  if (!applied.fillColor && !applied.strokeColor) {
    return {
      editable: false,
      override: null,
      wrapper: null,
      reason: "The requested paint colour already matches this text.",
    };
  }

  return {
    editable: true,
    override: applied,
    wrapper: { prefix: before.join(" "), suffix: after.join(" ") },
    reason: null,
  };
}
