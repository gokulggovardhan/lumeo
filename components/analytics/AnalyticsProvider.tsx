"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  fetchPublicAnalyticsEnabled,
  trackPublicAnalyticsEvent,
} from "@/lib/analytics/client";
import { providerTrackDecision } from "@/lib/analytics/state";
import type {
  AnalyticsAvailability,
  AnalyticsEventInput,
  AnalyticsProviderTrackResult,
} from "@/lib/analytics/types";

type AnalyticsContextValue = {
  availability: AnalyticsAvailability;
  enabled: boolean;
  ready: boolean;
  track: (event: AnalyticsEventInput) => AnalyticsProviderTrackResult;
};

const AnalyticsContext = createContext<AnalyticsContextValue>({
  availability: "disabled",
  enabled: false,
  ready: true,
  track: () => ({ accepted: false, reason: "unavailable" }),
});

const PUBLIC_ANALYTICS_ROUTES = new Set([
  "/",
  "/pdf-tools",
  "/pdf/merge",
  "/pdf/split",
  "/pdf/compress",
  "/pdf/jpg-to-pdf",
  "/pdf/pdf-to-jpg",
  "/pdf/word-to-pdf",
]);

function doNotTrackEnabled() {
  if (typeof navigator === "undefined") return true;
  return navigator.doNotTrack === "1";
}

function debugOverrideEnabled() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_ANALYTICS_DEBUG === "true"
  );
}

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [availability, setAvailability] = useState<AnalyticsAvailability>("loading");

  useEffect(() => {
    let active = true;
    const routeAllowed = PUBLIC_ANALYTICS_ROUTES.has(pathname);
    const debugOverride = debugOverrideEnabled();
    const doNotTrack = doNotTrackEnabled();

    window.queueMicrotask(() => {
      if (active) setAvailability("loading");
    });

    if (!routeAllowed) {
      window.queueMicrotask(() => {
        if (active) setAvailability("disabled");
      });
      return () => {
        active = false;
      };
    }

    if (doNotTrack) {
      window.queueMicrotask(() => {
        if (active) setAvailability("disabled");
      });
      return () => {
        active = false;
      };
    }

    if (debugOverride) {
      window.queueMicrotask(() => {
        if (active) setAvailability("enabled");
      });
      return () => {
        active = false;
      };
    }

    void fetchPublicAnalyticsEnabled().then((value) => {
      if (active) setAvailability(value ? "enabled" : "disabled");
    });

    return () => {
      active = false;
    };
  }, [pathname]);

  const track = useCallback(
    (event: AnalyticsEventInput): AnalyticsProviderTrackResult => {
      const decision = providerTrackDecision({
        availability,
        doNotTrack: doNotTrackEnabled(),
        event,
      });
      if (!decision.accepted) return decision;
      void trackPublicAnalyticsEvent(event);
      return decision;
    },
    [availability],
  );

  const enabled = availability === "enabled";
  const ready = availability !== "loading";
  const value = useMemo(
    () => ({ availability, enabled, ready, track }),
    [availability, enabled, ready, track],
  );

  return (
    <AnalyticsContext.Provider value={value}>
      {children}
    </AnalyticsContext.Provider>
  );
}

export function useAnalytics() {
  return useContext(AnalyticsContext);
}
