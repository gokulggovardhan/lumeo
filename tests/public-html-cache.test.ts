import assert from "node:assert/strict";
import test from "node:test";
import {
  publicHtmlCacheKey,
  mayCachePublicHtml,
  publicHtmlCacheStorageCopy,
  publicHtmlCacheBrowserCopy,
  PUBLIC_HTML_EDGE_TTL_SECONDS,
} from "../worker/public-html-cache.ts";

const sha = "f0cc5ca6ddbcb33cd732d11dfecd2e89d0cbfc74";
const req = (route: string, init?: RequestInit) =>
  new Request("https://lumeo.in" + route, init);

test("only versioned, canonical public HTML GET routes are cacheable", () => {
  for (const path of ["/", "/pdf", "/pdf-tools", "/pdf/edit", "/pdf/pdf-to-word"]) {
    const key = publicHtmlCacheKey(req(path), sha);
    assert.ok(key);
    assert.ok(key.url.includes("/__lumeo_edge_public_html/" + sha));
  }
  assert.notEqual(publicHtmlCacheKey(req("/pdf"), sha)!.url, publicHtmlCacheKey(req("/pdf"), "a".repeat(40))!.url);
  for (const p of ["/admin", "/api/analytics/setting", "/pdf/finish", "/pdf/merge", "/pdf/word-to-pdf", "/pdf?preview=1"]) {
    assert.equal(publicHtmlCacheKey(req(p), sha), null, p);
  }
  assert.equal(publicHtmlCacheKey(new Request("https://www.lumeo.in/pdf"), sha), null);
  assert.equal(publicHtmlCacheKey(new Request("http://lumeo.in/pdf"), sha), null);
});

test("do not cache private, authenticated, RSC, prefetch or non-GET responses", () => {
  assert.equal(publicHtmlCacheKey(req("/pdf",{method:"POST"}), sha), null);
  for (const [name,value] of [
    ["authorization","Bearer test"],
    ["rsc","1"],
    ["next-router-state-tree","..."],
    ["next-router-prefetch","1"],
    ["next-router-segment-prefetch","1"],
    ["cookie","sb-project-auth-token=secret"],
    ["cookie","__session=secret"],
    ["cache-control","no-cache"],
    ["accept","application/json"],
  ]) {
    assert.equal(publicHtmlCacheKey(req("/pdf",{headers:{[name]:value}}),sha),null,name);
  }
  assert.ok(publicHtmlCacheKey(req("/pdf",{headers:{cookie:"lumeo_analytics_visitor=opaque"}}),sha));
});

test("never cache errors, redirects, binary responses or Set-Cookie", () => {
  assert.equal(mayCachePublicHtml(new Response("<h1>OK</h1>",{headers:{"content-type":"text/html"}})),true);
  assert.equal(mayCachePublicHtml(new Response("bad",{status:503,headers:{"content-type":"text/html"}})),false);
  assert.equal(mayCachePublicHtml(new Response("redirect",{status:302,headers:{"content-type":"text/html"}})),false);
  assert.equal(mayCachePublicHtml(new Response("pdf",{headers:{"content-type":"application/pdf"}})),false);
  assert.equal(mayCachePublicHtml(new Response("html",{headers:{"content-type":"text/html","set-cookie":"auth=secret"}})),false);
});

test("edge cache TTL stays bounded and browser response stays private/no-store", async () => {
  assert.equal(PUBLIC_HTML_EDGE_TTL_SECONDS,180);
  const response = new Response("public page",{
    headers:{"content-type":"text/html","cache-control":"private, no-store"},
  });
  const entry = publicHtmlCacheStorageCopy(response);
  assert.equal(await entry.clone().text(),"public page");
  assert.equal(entry.headers.get("cache-control"),"public, max-age=180");
  const visitor = publicHtmlCacheBrowserCopy(entry);
  assert.equal(await visitor.text(),"public page");
  assert.match(visitor.headers.get("cache-control") ?? "",/private, no-store/);
});
