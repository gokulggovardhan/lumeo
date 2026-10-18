import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read=(p:string)=>readFileSync(p,"utf8");

test("public documents do not use Cloudflare HTML Cache API",()=>{
  const worker=read("worker/index.ts");
  assert.doesNotMatch(worker,/caches\.default|edgeCache\.|publicHtmlCacheKey|publicHtmlCacheStorageCopy/);
  assert.match(worker,/handler\.fetch\(\.\.\.args\)/);
  assert.match(worker,/withProductionSecurityHeaders\(request, response\)/);
});

test("Workspace upload uses lightweight but identical shared upload primitives",()=>{
  const start=read("components/pdf/workspace/WorkspaceStart.tsx");
  const ui=read("components/pdf/workspace/WorkspaceEntryPrimitives.tsx");
  const shared=read("components/pdf/workspace/ToolWorkspace.tsx");
  assert.match(start,/from "@\/components\/pdf\/workspace\/WorkspaceEntryPrimitives"/);
  assert.doesNotMatch(start,/from "@\/components\/pdf\/workspace\/ToolWorkspace"/);
  assert.match(ui,/data-upload-client-ready/);
  assert.match(ui,/onFilesSelected\?\.\(selectedFiles\)/);
  assert.match(ui,/handleDragEnter/);
  assert.match(ui,/handleDrop/);
  assert.match(ui,/export function L2UploadStage/);
  assert.match(ui,/export function ToolPrivacyNote/);
  assert.match(shared,/export \{ L2UploadStage \} from "\.\/WorkspaceEntryPrimitives"/);
  assert.match(shared,/export \{ ToolPrivacyNote \} from "\.\/WorkspaceEntryPrimitives"/);
});
