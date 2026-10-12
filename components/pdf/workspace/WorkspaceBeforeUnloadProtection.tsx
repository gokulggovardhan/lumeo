"use client";

import { useEffect } from "react";
import { useWorkspaceDocument } from "./WorkspaceDocumentProvider";

/**
 * Warn only when leaving the browser document would discard Workspace changes.
 * Internal Next.js tool switches keep the same page and need no custom prompt.
 * Browser-native dialogs require user interaction and are browser-controlled.
 */
export function WorkspaceBeforeUnloadProtection() {
  const { document } = useWorkspaceDocument();
  const hasUnsavedChanges = document?.session.state.hasUnsavedChanges ?? false;

  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedChanges]);

  return null;
}
