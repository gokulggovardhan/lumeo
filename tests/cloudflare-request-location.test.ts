import assert from "node:assert/strict";
import test from "node:test";

import {
  encodeAnalyticsGeoCookie,
  formatApproximateLocation,
  readCloudflareApproximateLocation,
} from "../lib/cloudflare/request-location.ts";

test("prefers visitor IP geography and keeps full region separate from region code", () => {
  const request = new Request("https://lumeo.in/") as Request & {
    cf?: Record<string, unknown>;
  };
  request.cf = {
    city: "Pune",
    region: "Maharashtra",
    regionCode: "MH",
    country: "IN",
    colo: "BOM",
  };

  assert.deepEqual(readCloudflareApproximateLocation(request), {
    city: "Pune",
    region: "Maharashtra",
    regionCode: "MH",
    country: "IN",
  });
});

test("falls back to Cloudflare visitor-location headers without using colo", () => {
  const request = new Request("https://lumeo.in/", {
    headers: {
      "cf-ipcity": "Tirupati",
      "cf-region": "Andhra Pradesh",
      "cf-region-code": "AP",
      "cf-ipcountry": "IN",
      "cf-ray": "example-BOM",
    },
  });

  assert.deepEqual(readCloudflareApproximateLocation(request), {
    city: "Tirupati",
    region: "Andhra Pradesh",
    regionCode: "AP",
    country: "IN",
  });
});

test("never invents geography and degrades to an empty location", () => {
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

test("formats feedback with full visitor region when available", () => {
  const location = {
    city: "Pune",
    region: "Maharashtra",
    regionCode: "MH",
    country: "IN",
  };
  assert.equal(formatApproximateLocation(location), "Pune, Maharashtra, IN");
  assert.equal(encodeAnalyticsGeoCookie(location), "Pune|Maharashtra|IN");
});
