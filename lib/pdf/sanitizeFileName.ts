const ILLEGAL_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;

// Strips the extension, control characters, and trailing dot/space runs
// (Windows rejects filenames ending in "." or " ") and caps length so the
// browser's save-as dialog never chokes on the result.
export function sanitizeFileStem(name: string, fallback: string): string {
  const withoutExtension = name.replace(/\.[^/.]+$/, "");
  const withoutIllegalChars = withoutExtension.replace(ILLEGAL_CHARS, "-");
  const withoutWhitespace = withoutIllegalChars.replace(/\s+/g, "-");
  const collapsedDashes = withoutWhitespace.replace(/-+/g, "-");
  const trimmedEdges = collapsedDashes
    .replace(/[. ]+$/g, "")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 120);

  return trimmedEdges || fallback;
}
