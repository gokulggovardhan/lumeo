import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

// Execute the actual listener registration with useEffect/capture spies. No
// browser, production document, server or telemetry endpoint is involved.
test("global error listeners never forward document text, exception stacks or rejection objects", async () => {
  const source = readFileSync("components/errors/ErrorMonitor.tsx", "utf8");
  const captures: unknown[] = [];
  const listeners = new Map<string, (event: unknown) => void>();
  let cleanup: (() => void) | undefined;
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText
    .replace(/import \{ useEffect \} from "react";/, "const useEffect = effect;")
    .replace(/import \{ captureClientError \} from "@\/lib\/errors\/client";/, "const captureClientError = capture;")
    .replace(/import \{ isNonActionableGlobalClientError \} from "@\/lib\/errors\/classification";/, "const isNonActionableGlobalClientError = () => false;")
    .replace("export function ErrorMonitor", "function ErrorMonitor");
  const execute = new Function("window", "effect", "capture", `${code}; ErrorMonitor();`);
  execute({
    addEventListener: (name: string, fn: (event: unknown) => void) => listeners.set(name, fn),
    removeEventListener: (name: string) => listeners.delete(name),
  }, (effect: () => () => void) => { cleanup = effect(); }, (input: unknown) => { captures.push(input); });
  const error = new Error("PRIVATE_DOCUMENT_SENTINEL.pdf secret sentence");
  listeners.get("error")!({ message: error.message, error });
  listeners.get("unhandledrejection")!({ reason: error });
  listeners.get("unhandledrejection")!({ reason: { privateDocument: "PRIVATE_DOCUMENT_SENTINEL" } });
  assert.equal(captures.length, 3);
  assert.doesNotMatch(JSON.stringify(captures), /PRIVATE_DOCUMENT|secret sentence|stack/);
  assert.deepEqual(captures[0], { message: "Unhandled client error", source: "client", severity: "medium" });
  cleanup!();
  assert.equal(listeners.size, 0);
});
