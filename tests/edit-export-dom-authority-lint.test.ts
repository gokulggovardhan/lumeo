import assert from "node:assert/strict";
import test from "node:test";
import { ESLint } from "eslint";

test("export-path lint guard rejects DOM layout measurements", async () => {
  const eslint = new ESLint({ cwd: process.cwd() });
  const [result] = await eslint.lintText(
    [
      "export function invalidExportAuthority(node: Element) {",
      "  return node.getBoundingClientRect().width;",
      "}",
    ].join("\n"),
    { filePath: "lib/pdf/edit/editPlan.ts" },
  );

  assert.ok(
    result.messages.some(
      (message) =>
        message.ruleId === "no-restricted-syntax" &&
        /DOM\/CSS measurements are presentation-only/i.test(message.message),
    ),
    JSON.stringify(result.messages, null, 2),
  );
});

test("export-path lint guard rejects layout dimension properties", async () => {
  const eslint = new ESLint({ cwd: process.cwd() });
  const [result] = await eslint.lintText(
    [
      "export function invalidExportAuthority(node: HTMLElement) {",
      "  return node.offsetWidth;",
      "}",
    ].join("\n"),
    { filePath: "lib/pdf/edit/coordinateMapper.ts" },
  );

  assert.ok(
    result.messages.some(
      (message) =>
        message.ruleId === "no-restricted-syntax" &&
        /DOM layout dimensions are presentation-only/i.test(message.message),
    ),
    JSON.stringify(result.messages, null, 2),
  );
});
