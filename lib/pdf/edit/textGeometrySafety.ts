// lib/pdf/edit/textGeometrySafety.ts
//
// Shared fail-closed geometry limits for native PDF text rewriting.
//
// This module deliberately contains only pure PDF-space math. It has no DOM,
// PDF.js or browser dependency, so capability classification and EditPlan
// validation use the exact same threshold without either layer depending on
// the other.

export const MAX_NATIVE_TEXT_SKEW_DEG = 4;

/**
 * Measures how far the two text basis axes deviate from remaining mutually
 * orthogonal after rotation. Ordinary rotation keeps this at zero; shear/skew
 * grows it. The result is normalized into [0, 90].
 */
export function matrixSkewMagnitudeDeg(matrix: readonly number[]): number {
  if (matrix.length < 4) return Number.POSITIVE_INFINITY;
  const x = (Math.atan2(matrix[1], matrix[0]) * 180) / Math.PI;
  const y = (Math.atan2(-matrix[2], matrix[3]) * 180) / Math.PI;
  const delta = Math.abs(y - x) % 180;
  return Math.min(delta, 180 - delta);
}

export function nativeTextTransformIsMateriallySkewed(
  matrix: readonly number[],
): boolean {
  return matrixSkewMagnitudeDeg(matrix) > MAX_NATIVE_TEXT_SKEW_DEG;
}
