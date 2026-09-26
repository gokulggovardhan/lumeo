import { applyEditPlanToBytes } from "./applyEditPlan.ts";
import type { ValidatedEditPlan } from "./editPlan.ts";
import type { NativePaintPlan } from "./nativePaint.ts";

export class NativePaintPlanRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NativePaintPlanRejectedError";
  }
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const size = parts.reduce((total, part) => total + part.byteLength, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

/**
 * Reuses the established text replacement writer first, then wraps only the
 * rewritten operator segment in a proven native paint prefix + exact restore
 * suffix. Nothing here re-encodes glyphs, recomputes TJ compensation, changes
 * font resources, or reimplements text-state formatting.
 *
 * `applyEditPlanToBytes()` changes exactly one contiguous source range. That
 * means the rewritten segment still begins at `plan.byteOffset`, and its new
 * length is the old range length plus the total stream-size delta. This lets
 * paint formatting compose with the current writer without knowing anything
 * about whether that writer emitted Tj, TJ, Tf/Tc/Tw/Tz wrappers, or fallback
 * font operators inside the segment.
 */
export function applyEditPlanWithNativePaintToBytes(
  contentStreamBytes: Uint8Array,
  plan: ValidatedEditPlan,
  bytesPerCode: 1 | 2,
  paintPlan: NativePaintPlan,
  options: { fallbackResourceName?: string } = {},
): Uint8Array {
  if (!paintPlan.editable) {
    throw new NativePaintPlanRejectedError(paintPlan.reason);
  }

  const edited = applyEditPlanToBytes(contentStreamBytes, plan, bytesPerCode, options);
  const streamDelta = edited.byteLength - contentStreamBytes.byteLength;
  const rewrittenLength = plan.byteLength + streamDelta;
  const rewrittenEnd = plan.byteOffset + rewrittenLength;

  if (
    plan.byteOffset < 0 ||
    rewrittenLength <= 0 ||
    rewrittenEnd > edited.byteLength
  ) {
    throw new NativePaintPlanRejectedError(
      "The rewritten text operator could not be isolated for a local paint-state wrapper.",
    );
  }

  const encoder = new TextEncoder();
  const prefix = encoder.encode(`${paintPlan.wrapper.prefix} `);
  const suffix = encoder.encode(` ${paintPlan.wrapper.suffix}`);

  return concatBytes([
    edited.subarray(0, plan.byteOffset),
    prefix,
    edited.subarray(plan.byteOffset, rewrittenEnd),
    suffix,
    edited.subarray(rewrittenEnd),
  ]);
}
