import assert from "node:assert/strict";
import test from "node:test";

import {
  encodeAnalyticsGeoCookie,
  formatApproximateLocation,
  readCloudflareApproximateLocation,
} from "../lib/cloudflare/request-location.ts";
import { classifyAnalyticsTraffic } from "../lib/analytics/traffic-classification.ts";
import { formatLocationLabel } from "../lib/analytics/location-names.ts";

test("prefers Cloudflare Request.cf geolocation", () => {
  const request = new Request("https://lumeo.in/") as Request & {
    cf?: Record<string, string>;
  };
  request.cf = {
    city: "Pune",
    region: "Maharashtra",
    regionCode: "MH",
    country: "IN",
  };

  assert.deepEqual(readCloudflareApproximateLocation(request), {
    city: "Pune",
    region: "Maharashtra",
    regionCode: "MH",
    country: "IN",
  });
});

test("expands trusted India and US region/country codes for Admin display", () => {
  assert.equal(
    formatLocationLabel("Pune", "MH", "IN"),
    "Pune, Maharashtra, India",
  );
  assert.equal(
    formatLocationLabel("Omaha", "NE", "US"),
    "Omaha, Nebraska, United States",
  );
  assert.equal(formatLocationLabel(null, null, null), "Unknown location");
});

test("falls back to Cloudflare visitor-location headers", () => {
  const request = new Request("https://lumeo.in/", {
    headers: {
      "cf-ipcity": "Pune",
      "cf-region-code": "MH",
      "cf-ipcountry": "IN",
    },
  });

  assert.deepEqual(readCloudflareApproximateLocation(request), {
    city: "Pune",
    region: "MH",
    regionCode: "MH",
    country: "IN",
  });
});

test("never needs an IP address and degrades to an empty location", () => {
  const request = new Request("http://127.0.0.1:3000/");
  const location = readCloudflareApproximateLocation(request);

  assert.deepEqual(location, {
    city: null,
    region: null,
    regionCode: null,
    country: null,
  });
  assert.equal(formatApproximateLocation(location), null);
  assert.equal(encodeAnalyticsGeoCookie(location), null);
});

test("formats feedback labels and analytics cookie compatibly", () => {
  const location = {
    city: "Pune",
    region: "Maharashtra",
    regionCode: "MH",
    country: "IN",
  };
  assert.equal(formatApproximateLocation(location), "Pune, Maharashtra, IN");
  assert.equal(encodeAnalyticsGeoCookie(location), "Pune|MH|IN");
});


test("trusted Cloudflare US geography is preserved without guessing around VPN or proxy routing", () => {
  const request = new Request("https://lumeo.in/") as Request & {
    cf?: Record<string, string>;
  };
  request.cf = {
    city: "Omaha",
    region: "Nebraska",
    regionCode: "NE",
    country: "US",
    colo: "IAD",
  };

  assert.deepEqual(readCloudflareApproximateLocation(request), {
    city: "Omaha",
    region: "Nebraska",
    regionCode: "NE",
    country: "US",
  });
});

test("partial Cloudflare geography stays partial for downstream Unknown Location handling", () => {
  const request = new Request("https://lumeo.in/") as Request & {
    cf?: Record<string, string>;
  };
  request.cf = {
    region: "Maharashtra",
    regionCode: "MH",
    country: "IN",
  };

  assert.deepEqual(readCloudflareApproximateLocation(request), {
    city: null,
    region: "Maharashtra",
    regionCode: "MH",
    country: "IN",
  });
});

test("Cloudflare colo and unrelated server-location headers are never visitor geography", () => {
  const request = new Request("https://lumeo.in/", {
    headers: {
      "x-vercel-ip-city": "Server City",
      "x-worker-region": "server-region",
      "cf-ray": "example-IAD",
    },
  }) as Request & {
    cf?: Record<string, string>;
  };
  request.cf = { colo: "IAD" };

  assert.deepEqual(readCloudflareApproximateLocation(request), {
    city: null,
    region: null,
    regionCode: null,
    country: null,
  });
});

test("traffic classification separates owned tests and reliable automation without treating uncertain clients as bots", () => {
  assert.equal(
    classifyAnalyticsTraffic({
      userAgent: "Mozilla/5.0 Chrome/140.0 LumeoSyntheticTest/1",
    }).trafficClass,
    "synthetic",
  );
  assert.equal(
    classifyAnalyticsTraffic({
      userAgent: "Mozilla/5.0",
      cloudflareBot: { verifiedBot: true },
    }).trafficClass,
    "known_bot",
  );
  assert.equal(
    classifyAnalyticsTraffic({
      userAgent: "Mozilla/5.0 HeadlessChrome/140.0",
    }).trafficClass,
    "suspected_automation",
  );
  assert.equal(
    classifyAnalyticsTraffic({
      userAgent: "curl/8.0 unusual-but-not-proven-bot",
    }).trafficClass,
    "real_audience",
  );
});
