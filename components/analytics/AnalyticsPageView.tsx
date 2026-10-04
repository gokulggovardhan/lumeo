"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { useAnalytics } from "@/components/analytics/AnalyticsProvider";
import { shouldAttemptOnce } from "@/lib/analytics/state";

// Survives component remounts inside the same SPA runtime so repeated provider
// initialization cannot double-count the same navigation. A real browser reload
// starts a fresh runtime, and navigating to a different route updates the value.
let lastAcceptedPagePathInRuntime: string | null = null;

const PUBLIC_PAGE_ROUTES = new Set([
  "/heic-to-jpeg",
  "/",
  "/pdf-tools",
  "/pdf",
  "/pdf/merge",
  "/pdf/split",
  "/pdf/organize",
  "/pdf/compress",
  "/pdf/jpg-to-pdf",
  "/pdf/pdf-to-jpg",
  "/pdf/extract-text",
  "/pdf/edit",
  "/pdf/watermark",
  "/pdf/crop",
  "/pdf/sign",
  "/pdf/add",
  "/pdf/page-numbers",
  "/pdf/header-footer",
  "/pdf/finish",
  "/pdf/word-to-pdf",
  "/pdf/pdf-to-word",
  "/pdf/html-to-pdf",
]);

export function AnalyticsPageView() {
  const pathname = usePathname();
  const { availability, track } = useAnalytics();
  const lastTrackedPath = useRef<string | null>(null);

  useEffect(() => {
    if (!PUBLIC_PAGE_ROUTES.has(pathname)) {
      lastAcceptedPagePathInRuntime = null;
      return;
    }

    const alreadyAccepted =
      lastTrackedPath.current === pathname ||
      lastAcceptedPagePathInRuntime === pathname;
    if (!shouldAttemptOnce({ availability, alreadyAccepted })) return;

    const result = track({ eventName: "page_view" });
    if (result.accepted) {
      lastTrackedPath.current = pathname;
      lastAcceptedPagePathInRuntime = pathname;
    }
  }, [availability, pathname, track]);

  return null;
}
