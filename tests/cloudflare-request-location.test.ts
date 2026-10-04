import assert from "node:assert/strict";
import test from "node:test";

import {
  formatApproximateLocation,
  readCloudflareApproximateLocation,
} from "../lib/cloudflare/request-location.ts";

test("uses Cloudflare visitor geolocation and never the datacenter colo", () => {
  const request = new Request("https://lumeo.in/") as Request & {
    cf?: Record<string, string>;
  };
  request.cf = {
    city: "Pune",
    region: "Maharashtra",
    regionCode: "MH",
    country: "IN",
    colo: "IAD",
  };

  assert.deepEqual(readCloudflareApproximateLocation(request), {
    city: "Pune",
    region: "Maharashtra",
    regionCode: "MH",
    countryCode: "IN",
  });
  assert.equal(
    formatApproximateLocation(readCloudflareApproximateLocation(request)),
    "Pune, Maharashtra, India",
  );
});

test("falls back only to Cloudflare visitor-location headers", () => {
  const request = new Request("https://lumeo.in/", {
    headers: {
      "cf-ipcity": "Tirupati",
      "cf-region": "Andhra Pradesh",
      "cf-region-code": "AP",
      "cf-ipcountry": "IN",
    },
  });

  assert.deepEqual(readCloudflareApproximateLocation(request), {
    city: "Tirupati",
    region: "Andhra Pradesh",
    regionCode: "AP",
    countryCode: "IN",
  });
  assert.equal(
    formatApproximateLocation(readCloudflareApproximateLocation(request)),
    "Tirupati, Andhra Pradesh, India",
  );
});

test("invalid or unavailable country makes visitor geography unresolved", () => {
  const missing = readCloudflareApproximateLocation(
    new Request("http://127.0.0.1:3000/"),
  );
  assert.deepEqual(missing, {
    city: null,
    region: null,
    regionCode: null,
    countryCode: null,
  });
  assert.equal(formatApproximateLocation(missing), null);

  const invalid = new Request("https://lumeo.in/") as Request & {
    cf?: Record<string, string>;
  };
  invalid.cf = {
    city: "Ashburn",
    region: "Virginia",
    regionCode: "VA",
    country: "XX",
    colo: "IAD",
  };
  assert.deepEqual(readCloudflareApproximateLocation(invalid), {
    city: null,
    region: null,
    regionCode: null,
    countryCode: null,
  });
});

test("partial genuine location never invents missing city or region", () => {
  const request = new Request("https://lumeo.in/") as Request & {
    cf?: Record<string, string>;
  };
  request.cf = { country: "IN" };

  const location = readCloudflareApproximateLocation(request);
  assert.deepEqual(location, {
    city: null,
    region: null,
    regionCode: null,
    countryCode: "IN",
  });
  assert.equal(formatApproximateLocation(location), "India");
});
