import assert from "node:assert/strict";
import test from "node:test";

import { fetchRuntimeAssetWithRetry } from "../lib/conversion/runtimeAssetUpstream.ts";

const url = "https://github.com/gokulggovardhan/lumeo/releases/download/pinned/soffice.js";

test("fallback Office runtime retries 504 and 429 without losing HEAD or immutable-source isolation", async () => {
  const prior = globalThis.fetch;
  let count = 0;
  const methods: string[] = [];
  const cacheModes: Array<RequestCache | undefined> = [];
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    count++;
    methods.push(init?.method ?? "");
    cacheModes.push(init?.cache);
    if (count < 3) return new Response(null, { status: count === 1 ? 504 : 429 });
    return new Response(null, { status: 200, headers: { "Content-Length": "3120" } });
  }) as typeof fetch;

  try {
    const response = await fetchRuntimeAssetWithRetry(
      new Request("http://127.0.0.1:3100/office-runtime/pinned/soffice.js", { method: "HEAD" }),
      url,
      new Headers(),
      [0, 0, 0],
    );
    assert.equal(response.status, 200);
    assert.equal(count, 3);
    assert.deepEqual(methods, ["HEAD", "HEAD", "HEAD"]);
    assert.deepEqual(cacheModes, ["no-store", "no-store", "no-store"]);
  } finally {
    globalThis.fetch = prior;
  }
});

test("fallback Office runtime preserves a successful Range stream and never retries it", async () => {
  const prior = globalThis.fetch;
  let count = 0;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    count++;
    assert.equal(new Headers(init?.headers).get("Range"), "bytes=0-0");
    assert.equal(init?.method, "GET");
    return new Response(new Uint8Array([37]), {
      status: 206,
      headers: { "Content-Range": "bytes 0-0/161667499" },
    });
  }) as typeof fetch;
  try {
    const response = await fetchRuntimeAssetWithRetry(
      new Request("http://127.0.0.1:3100/office-runtime/pinned/soffice.wasm", {
        headers: { Range: "bytes=0-0" },
      }),
      url,
      new Headers({ Range: "bytes=0-0" }),
      [0],
    );
    assert.equal(count, 1);
    assert.equal(response.status, 206);
    assert.deepEqual(Array.from(new Uint8Array(await response.arrayBuffer())), [37]);
  } finally {
    globalThis.fetch = prior;
  }
});

test("fallback Office runtime does not mask terminal upstream 403 or 404", async () => {
  const prior = globalThis.fetch;
  let count = 0;
  globalThis.fetch = (async () => {
    count++;
    return new Response(null, { status: 403 });
  }) as typeof fetch;
  try {
    const response = await fetchRuntimeAssetWithRetry(new Request(url), url, new Headers(), [0, 0, 0]);
    assert.equal(response.status, 403);
    assert.equal(count, 1);
  } finally {
    globalThis.fetch = prior;
  }
});

test("fallback Office runtime can recover one transient fetch rejection", async () => {
  const prior = globalThis.fetch;
  let count = 0;
  globalThis.fetch = (async () => {
    if (++count === 1) throw new Error("Temporary connection reset");
    return new Response("document bytes", { status: 200 });
  }) as typeof fetch;
  try {
    const response = await fetchRuntimeAssetWithRetry(new Request(url), url, new Headers(), [0, 0]);
    assert.equal(await response.text(), "document bytes");
    assert.equal(count, 2);
  } finally {
    globalThis.fetch = prior;
  }
});

test("fallback Office runtime remains fail-closed after its bounded retry budget", async () => {
  const prior = globalThis.fetch;
  let count = 0;
  globalThis.fetch = (async () => {
    count++;
    return new Response(null, { status: 504 });
  }) as typeof fetch;
  try {
    const response = await fetchRuntimeAssetWithRetry(new Request(url), url, new Headers(), [0, 0, 0, 0, 0]);
    assert.equal(response.status, 504);
    assert.equal(count, 4, "Only three retries are allowed");
  } finally {
    globalThis.fetch = prior;
  }
});

test("fallback Office runtime stops retries when the caller aborts", async () => {
  const prior = globalThis.fetch;
  const controller = new AbortController();
  let count = 0;
  globalThis.fetch = (async () => {
    count++;
    controller.abort(new DOMException("Caller cancelled", "AbortError"));
    return new Response(null, { status: 503 });
  }) as typeof fetch;
  try {
    await assert.rejects(
      fetchRuntimeAssetWithRetry(
        new Request(url, { signal: controller.signal }),
        url,
        new Headers(),
        [10, 10],
      ),
      /Caller cancelled/,
    );
    assert.equal(count, 1);
  } finally {
    globalThis.fetch = prior;
  }
});
