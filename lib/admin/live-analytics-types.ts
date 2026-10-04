export type LiveTrafficScope =
  | "real_audience"
  | "synthetic"
  | "automation"
  | "all";

export type VerifiedLiveTrafficSummary = {
  pageViewsLastMinute: number;
  pageViewsLastFiveMinutes: number;
  activeVisitorsLastFiveMinutes: number;
  activeSessionsLastFiveMinutes: number;
  knownLocationPageViewsLastFiveMinutes: number;
  unknownLocationPageViewsLastFiveMinutes: number;
  lastPageViewAt: string | null;
};

export type VerifiedLiveMinuteBucket = {
  minute: string;
  pageViews: number;
  visitors: number;
};

export type VerifiedLiveHit = {
  occurredAt: string;
  pagePath: string | null;
  toolSlug: string | null;
  city: string | null;
  region: string | null;
  regionCode: string | null;
  countryCode: string | null;
};

export type VerifiedLiveTrafficData = {
  schemaVersion: 2;
  trafficScope: LiveTrafficScope;
  asOf: string;
  summary: VerifiedLiveTrafficSummary;
  minuteBuckets: VerifiedLiveMinuteBucket[];
  recentHits: VerifiedLiveHit[];
};
