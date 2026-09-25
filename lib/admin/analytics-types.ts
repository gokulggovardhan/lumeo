export type AnalyticsTrafficScope =
  | "real_audience"
  | "synthetic"
  | "automation"
  | "all";

export type AnalyticsAudienceSummary = {
  uniqueVisitors: number;
  newVisitors: number | null;
  returningVisitors: number | null;
  repeatedDailyVisitors: number | null;
  frequentVisitors: number | null;
  pageViews: number;
  toolUsers: number;
  toolOpens: number;
  processingStarted: number;
  processingSucceeded: number;
  processingFailed: number;
  downloadsStarted: number;
  averageSuccessfulDurationMs: number | null;
  latestEventAt: string | null;
  activeVisitors: number | null;
};

export type AnalyticsPreviousSummary = {
  uniqueVisitors: number;
  newVisitors: number | null;
  returningVisitors: number | null;
  pageViews: number;
  toolOpens: number;
  processingSucceeded: number;
  downloadsStarted: number;
};

export type AnalyticsDailyAudience = {
  date: string;
  uniqueVisitors: number;
  newVisitors: number | null;
  returningVisitors: number | null;
  repeatedDailyVisitors: number | null;
  pageViews: number;
  toolUsers: number;
  processingSucceeded: number;
  downloadsStarted: number;
};

export type AnalyticsHourlyAudience = {
  hour: number;
  uniqueVisitors: number;
  pageViews: number;
  toolOpens: number;
  processingSucceeded: number;
  downloadsStarted: number;
};

export type AnalyticsCountryRow = {
  countryCode: string;
  visitors: number;
};

export type AnalyticsRegionRow = {
  countryCode: string;
  region: string | null;
  regionCode: string | null;
  visitors: number;
};

export type AnalyticsCityRow = AnalyticsRegionRow & {
  city: string;
};

export type AnalyticsAcquisitionRow = {
  label: string;
  sessions: number;
  visitors: number;
};

export type AnalyticsToolPerformanceRow = {
  toolSlug: string;
  uniqueUsers: number;
  opens: number;
  processingStarted: number;
  succeeded: number;
  failed: number;
  downloads: number;
  completionRate: number | null;
  averageSuccessfulDurationMs: number | null;
  lifecycleApplicable: boolean;
};

export type AnalyticsFunnel = {
  visits: number;
  toolOpen: number;
  processingStarted: number;
  processingSucceeded: number;
  downloads: number;
};

export type AnalyticsTechnicalRow = {
  label: string;
  visitors: number;
};

export type AnalyticsTrafficCount = {
  trafficClass: string;
  events: number;
  visitors: number;
};

export type AnalyticsIntegrity = {
  verifiedEvents: number;
  legacyEvents: number;
  cutoverAt: string | null;
  latestVerifiedEventAt: string | null;
  locationEligibleVisitors: number;
  locationVerifiedVisitors: number;
  locationCoveragePercent: number | null;
};

export type VerifiedAnalyticsDashboard = {
  dataStatus: "available" | "unavailable";
  trafficScope: AnalyticsTrafficScope;
  summary: AnalyticsAudienceSummary;
  previousSummary: AnalyticsPreviousSummary;
  dailyAudience: AnalyticsDailyAudience[];
  hourlyAudience: AnalyticsHourlyAudience[];
  geography: {
    countries: AnalyticsCountryRow[];
    regions: AnalyticsRegionRow[];
    cities: AnalyticsCityRow[];
  };
  acquisition: {
    sources: AnalyticsAcquisitionRow[];
    referrers: AnalyticsAcquisitionRow[];
    landingPages: AnalyticsAcquisitionRow[];
    entryTools: AnalyticsAcquisitionRow[];
  };
  toolPerformance: AnalyticsToolPerformanceRow[];
  funnel: AnalyticsFunnel;
  technical: {
    device: AnalyticsTechnicalRow[];
    browser: AnalyticsTechnicalRow[];
    operatingSystem: AnalyticsTechnicalRow[];
  };
  trafficCounts: AnalyticsTrafficCount[];
  integrity: AnalyticsIntegrity;
};

export type VerifiedRecentAnalyticsEvent = {
  occurredAt: string;
  eventName: string;
  toolSlug: string | null;
  trafficClass: string;
  deviceClass: string | null;
  browserFamily: string | null;
  operatingSystem: string | null;
  city: string | null;
  region: string | null;
  regionCode: string | null;
  countryCode: string | null;
  geoPrecision: string | null;
  pagePath: string | null;
  acquisitionSource: string | null;
  success: boolean | null;
};
