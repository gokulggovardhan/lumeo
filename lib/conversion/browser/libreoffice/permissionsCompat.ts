"use client";

const CLIPBOARD_PERMISSION_NAMES = new Set(["clipboard-read", "clipboard-write"]);

type ClipboardPermissionName = "clipboard-read" | "clipboard-write";

type PermissionDescriptorWithClipboard = PermissionDescriptor & {
  name: PermissionName | ClipboardPermissionName;
};

const installedPermissions = new WeakSet<Permissions>();

export function isUnsupportedClipboardPermissionError(
  error: unknown,
  name?: unknown,
): boolean {
  if (name !== undefined && !CLIPBOARD_PERMISSION_NAMES.has(String(name))) {
    return false;
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  return (
    /clipboard-(read|write)/i.test(message) &&
    /not a valid value|PermissionName|permission descriptor/i.test(message)
  );
}

function deniedPermissionStatus(): PermissionStatus {
  const status = new EventTarget() as EventTarget & {
    readonly state: PermissionState;
    onchange: ((this: PermissionStatus, ev: Event) => unknown) | null;
  };

  Object.defineProperty(status, "state", {
    configurable: false,
    enumerable: true,
    value: "denied" satisfies PermissionState,
    writable: false,
  });
  status.onchange = null;
  return status as PermissionStatus;
}

/**
 * ZetaOffice probes Clipboard API permission names while booting. Firefox
 * currently rejects clipboard-read/clipboard-write as invalid PermissionName
 * values. That optional probe must not become an unhandled rejection or block
 * normal file conversion.
 *
 * Preserve the native Permissions API everywhere else. Only when the browser
 * itself rejects one of those two clipboard descriptors do we translate the
 * unsupported optional capability to an ordinary denied PermissionStatus.
 */
export function installOfficeClipboardPermissionCompatibility(): void {
  if (typeof navigator === "undefined" || !navigator.permissions) return;

  const permissions = navigator.permissions;
  if (installedPermissions.has(permissions)) return;

  const nativeQuery = permissions.query.bind(permissions);
  const compatibleQuery = async (
    descriptor: PermissionDescriptorWithClipboard,
  ): Promise<PermissionStatus> => {
    try {
      return await nativeQuery(descriptor as PermissionDescriptor);
    } catch (error) {
      if (
        CLIPBOARD_PERMISSION_NAMES.has(String(descriptor?.name)) &&
        isUnsupportedClipboardPermissionError(error, descriptor?.name)
      ) {
        return deniedPermissionStatus();
      }
      throw error;
    }
  };

  try {
    Object.defineProperty(permissions, "query", {
      configurable: true,
      value: compatibleQuery,
      writable: true,
    });
    installedPermissions.add(permissions);
  } catch {
    // If this browser does not allow the instance method to be shadowed, leave
    // its native behavior intact. Capability checks will still fail honestly.
  }
}
