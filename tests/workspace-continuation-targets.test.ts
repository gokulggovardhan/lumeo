import assert from "node:assert/strict";
import test from "node:test";
import {
  continuationTargetsFor,
  WORKSPACE_CONTINUATION_TARGETS,
} from "../lib/pdf/workspace/continuation.ts";

test("continuation keeps one canonical destination list", () => {
  assert.deepEqual(
    WORKSPACE_CONTINUATION_TARGETS.map((target) => [
      target.area,
      target.label,
      target.route,
    ]),
    [
      ["edit", "Edit", "/pdf/edit"],
      ["pages", "Pages", "/pdf/organize"],
      ["sign", "Sign", "/pdf/sign"],
      ["enhance", "Add", "/pdf/add"],
      ["optimize", "Compress", "/pdf/compress"],
      ["export", "Finish", "/pdf/finish"],
    ],
  );
});

test("continuation hides the current single-purpose area", () => {
  assert.deepEqual(
    continuationTargetsFor("edit").map((target) => target.area),
    ["pages", "sign", "enhance", "optimize", "export"],
  );
  assert.deepEqual(
    continuationTargetsFor("pages").map((target) => target.area),
    ["edit", "sign", "enhance", "optimize", "export"],
  );
});

test("Add remains repeatable so users can choose another add operation", () => {
  assert.equal(
    continuationTargetsFor("enhance").some((target) => target.area === "enhance"),
    true,
  );
});

test("known incompatible destinations are hidden before rendering", () => {
  assert.deepEqual(
    continuationTargetsFor("sign", ["edit", "optimize"]).map(
      (target) => target.area,
    ),
    ["pages", "enhance", "export"],
  );
});
