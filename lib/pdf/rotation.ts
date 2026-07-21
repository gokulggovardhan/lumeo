// Snaps to the nearest of the four PDF-legal rotation values; anything else
// (e.g. a corrupt /Rotate value) collapses to 0 rather than propagating.
export function normalizeRotation(value: number): 0 | 90 | 180 | 270 {
  const next = ((value % 360) + 360) % 360;
  return next === 0 || next === 90 || next === 180 || next === 270 ? next : 0;
}
