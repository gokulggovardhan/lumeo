import assert from "node:assert/strict";
import test from "node:test";
import {
  LOCAL_FIRST_DISCLOSURE,
  LOCAL_FIRST_MESSAGE,
  LOCAL_FIRST_SHORT,
} from "../lib/public-site/copy.ts";

test("local-first copy is concise, truthful, and avoids absolute claims", () => {
  assert.match(LOCAL_FIRST_SHORT, /Files stay on your device/);
  assert.match(LOCAL_FIRST_MESSAGE, /locally whenever supported/);
  assert.match(LOCAL_FIRST_MESSAGE, /No unnecessary server upload/);
  assert.match(LOCAL_FIRST_DISCLOSURE, /before file selection/);
  assert.doesNotMatch(
    `${LOCAL_FIRST_SHORT} ${LOCAL_FIRST_MESSAGE} ${LOCAL_FIRST_DISCLOSURE}`,
    /always|never uploaded|100%/i,
  );
});
