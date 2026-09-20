import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGeoCookieValue,
  formatApproximateLocation,
  readCloudflareGeo,
} from "../lib/cloudflare/geolocation.ts";

function requestWithCf(cf?: {
  city?: string | null;
  region?: string | null;
  country?: string | null;
}) {
  const request = new Request("https://lumeo.in/contact");
  if (cf) {
    Object.defineProperty(request, "cf", {
      configurable: true,
      enumerable: false,
      value: cf,
    });
  }
  return request;
}

test("reads only coarse Cloudflare city/region/country metadata", () => {
  const request = requestWithCf({
    city: "Pune",
    region: "Maharashtra",
    country: "IN",
  });

  assert.deepEqual(readCloudflareGeo(request), {
    city: "Pune",
    region: "Maharashtra",
    country: "IN",
  });
  assert.equal(formatApproximateLocation(request), "Pune, Maharashtra, IN");
  assert.equal(buildGeoCookieValue(request), "Pune|Maharashtra|IN");
});

test("preserves empty segments for the existing geo-cookie contract", () => {
  const request = requestWithCf({ city: null, region: "Maharashtra", country: "IN" });
  assert.equal(buildGeoCookieValue(request), "|Maharashtra|IN");
  assert.equal(formatApproximateLocation(request), "Maharashtra, IN");
});

test("returns null outside Cloudflare or when no location metadata is available", () => {
  assert.equal(readCloudflareGeo(requestWithCf()), null);
  assert.equal(formatApproximateLocation(requestWithCf({})), null);
  assert.equal(buildGeoCookieValue(requestWithCf({})), null);
});
