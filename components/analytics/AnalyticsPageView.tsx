"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { useAnalytics } from "@/components/analytics/AnalyticsProvider";
import { shouldAttemptOnce } from "@/lib/analytics/state";

const PUBLIC_PAGE_ROUTES = new Set([
  "/",
  "/pdf-tools",
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
  "/pdf/word-to-pdf",
  "/pdf/pdf-to-word",
  "/pdf/html-to-pdf",
]);

export function AnalyticsPageView() {
  const pathname = usePathname();
  const { availability, track } = useAnalytics();
  const lastTrackedPath = useRef<string | null>(null);

  useEffect(() => {
    if (!PUBLIC_PAGE_ROUTES.has(pathname)) return;
    if (!shouldAttemptOnce({ availability, alreadyAccepted: lastTrackedPath.current === pathname })) return;

    const result = track({ eventName: "page_view" });
    if (result.accepted) {
      lastTrackedPath.current = pathname;
    }
  }, [availability, pathname, track]);

  return null;
}
