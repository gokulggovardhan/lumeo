import assert from "node:assert/strict";
import test from "node:test";
import { ESLint } from "eslint";

test("export-path lint guard rejects DOM geometry authority", async () => {
  const eslint = new ESLint({ cwd: process.cwd() });
  const [result] = await eslint.lintText(
    [
      "export function forbidden(node: Element) {",
      "  const rect = node.getBoundingClientRect();",
      "  return rect.width + (node as HTMLElement).offsetWidth;",
      "}",
    ].join("\n"),
    { filePath: "lib/pdf/edit/applyEditPlan.ts" },
  );

  const restricted = result.messages.filter(
    (message) => message.ruleId === "no-restricted-syntax",
  );
  assert.ok(
    restricted.length >= 2,
    `expected DOM measurement guard violations, got: ${JSON.stringify(result.messages)}`,
  );
  assert.ok(
    restricted.some((message) => /DOM\/CSS measurements/i.test(message.message)),
  );
  assert.ok(
    restricted.some((message) => /DOM layout dimensions/i.test(message.message)),
  );
});

test("export-path lint guard does not ban pure PDF geometry", async () => {
  const eslint = new ESLint({ cwd: process.cwd() });
  const [result] = await eslint.lintText(
    [
      "export function allowed(widthPt: number, percent: number) {",
      "  return (percent / 100) * widthPt;",
      "}",
    ].join("\n"),
    { filePath: "lib/pdf/edit/coordinateMapper.ts" },
  );

  assert.equal(
    result.messages.filter((message) => message.ruleId === "no-restricted-syntax").length,
    0,
  );
});
