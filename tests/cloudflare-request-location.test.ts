import assert from "node:assert/strict";
import test from "node:test";

import {
  encodeAnalyticsGeoCookie,
  formatApproximateLocation,
  readCloudflareApproximateLocation,
} from "../lib/cloudflare/request-location.ts";

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
    region: "MH",
    country: "IN",
  });
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
    country: "IN",
  });
});

test("never needs an IP address and degrades to an empty location", () => {
  const request = new Request("http://127.0.0.1:3000/");
  const location = readCloudflareApproximateLocation(request);

  assert.deepEqual(location, { city: null, region: null, country: null });
  assert.equal(formatApproximateLocation(location), null);
  assert.equal(encodeAnalyticsGeoCookie(location), null);
});

test("formats feedback labels and analytics cookie compatibly", () => {
  const location = { city: "Pune", region: "MH", country: "IN" };
  assert.equal(formatApproximateLocation(location), "Pune, MH, IN");
  assert.equal(encodeAnalyticsGeoCookie(location), "Pune|MH|IN");
});
