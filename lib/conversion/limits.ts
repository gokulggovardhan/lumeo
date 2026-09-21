export const MAX_BROWSER_CONVERSION_FILE_BYTES = 250 * 1024 * 1024;

export function checkBrowserConversionFileSize(file: File): string | null {
  if (file.size <= MAX_BROWSER_CONVERSION_FILE_BYTES) return null;
  return "This file is too large. Lumeo supports files up to 250 MB for local conversion.";
}
