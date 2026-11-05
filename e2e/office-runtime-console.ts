import runtimeRelease from "../config/office-runtime-release.json" with { type: "json" };

const PINNED_OFFICE_JS_URL =
  `https://lumeo.in/office-runtime/${runtimeRelease.releaseId}/soffice.js`;

/**
 * Emscripten prints dependency-progress updates using console.error before
 * the Office WASM engine finishes loading. These are NOT conversion failures.
 * Match only the exact pinned, first-party release script and the three
 * documented progress message shapes, never arbitrary errors from that file.
 */
export function isPinnedOfficeDependencyProgress(
  sourceUrl: string,
  message: string,
): boolean {
  if (sourceUrl !== PINNED_OFFICE_JS_URL) return false;
  const line = message.trim();
  return (
    line === "still waiting on run dependencies:" ||
    line === "(end of list)" ||
    line === "QRect(0,0 0x0) 1" ||
    line === "QObject::connect(QWindow, QtFrame): invalid nullptr parameter" ||
    line === "warning: unsupported syscall: __syscall_mprotect" ||
    /^dependency: (?:wasm-instantiate|fp \/[A-Za-z0-9._/-]+|datafile_\/[A-Za-z0-9._/-]+)$/.test(line)
  );
}
