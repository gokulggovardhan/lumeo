import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Edit PDF privacy LCP text is server-rendered without waiting for client hydration", () => {
  const page = readFileSync("app/pdf/edit/page.tsx", "utf8");
  const deferred = readFileSync("components/pdf/edit/DeferredEditPdfTool.tsx", "utf8");
  assert.match(page, /import \{ LOCAL_FIRST_SHORT \} from "@\/lib\/public-site\/copy"/);
  assert.match(page, /<span>\{LOCAL_FIRST_SHORT\}<\/span>/);
  assert.match(page, /l2-privacy-note/);
  assert.doesNotMatch(deferred, /<L2PrivacyNote\s*\/>/);
  assert.match(deferred, /<L2UploadStage/);
  assert.match(deferred, /dynamic\(\(\) => import\("@\/components\/pdf\/EditPdfTool"\)/);
});
