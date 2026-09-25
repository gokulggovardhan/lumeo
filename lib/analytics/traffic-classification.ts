export type AnalyticsTrafficClass =
  | "real_audience"
  | "synthetic"
  | "known_bot"
  | "suspected_automation";

export type TrafficClassification = {
  trafficClass: AnalyticsTrafficClass;
  reason: string;
};

type CloudflareBotContext = {
  verifiedBot?: boolean | null;
};

const KNOWN_BOT_PATTERN =
  /(?:googlebot|bingbot|duckduckbot|baiduspider|yandexbot|slurp|crawler|spider|facebookexternalhit|twitterbot|linkedinbot|whatsapp)/i;
const AUTOMATION_PATTERN =
  /(?:HeadlessChrome|Playwright|Puppeteer|Selenium|PhantomJS)/i;

export function classifyAnalyticsTraffic({
  syntheticVerified,
  userAgent,
  cloudflareBot,
}: {
  syntheticVerified: boolean;
  userAgent: string | null;
  cloudflareBot?: CloudflareBotContext | null;
}): TrafficClassification {
  if (syntheticVerified) {
    return { trafficClass: "synthetic", reason: "github_actions_oidc" };
  }

  if (cloudflareBot?.verifiedBot === true) {
    return { trafficClass: "known_bot", reason: "cloudflare_verified_bot" };
  }

  if (userAgent && KNOWN_BOT_PATTERN.test(userAgent)) {
    return { trafficClass: "known_bot", reason: "known_bot_user_agent" };
  }

  if (userAgent && AUTOMATION_PATTERN.test(userAgent)) {
    return { trafficClass: "suspected_automation", reason: "automation_user_agent" };
  }

  return { trafficClass: "real_audience", reason: "default_real_audience" };
}
