import assert from "node:assert/strict";
import test from "node:test";
import { createWorkspaceDocument, type WorkspaceOperation } from "../lib/pdf/workspace/model.ts";
import { captureWorkspaceFlow, parseWorkspaceFlow, planWorkspaceFlow, serializeWorkspaceFlow } from "../lib/pdf/workspace/flows.ts";
import { createDocumentSession, recordWorkspaceOperation, undoWorkspaceOperation } from "../lib/pdf/workspace/session.ts";

const privateDocument = createWorkspaceDocument("secret-document-id", {
  id: "secret-source-id", name: "private-patient-record.pdf", pageCount: 2, byteLength: 10_000,
});

function session() {
  return createDocumentSession({ id: "private-session", document: privateDocument, initialArea: "pages" });
}

function op(overrides: Partial<WorkspaceOperation> = {}): WorkspaceOperation {
  return {
    id: "private-operation-id", type: "optimize.compress", area: "optimize", description: "My very private report",
    scope: { kind: "document" },
    parameters: { mode: "quality", profile: "balanced", originalBytes: 10_000, outputBytes: 6_000 },
    undoable: true, affectsPreview: true, affectsExport: true,
    flow: { eligible: true, version: 1 }, ...overrides,
  };
}

test("capture only portable template settings, never file identity or size", () => {
  const captured = captureWorkspaceFlow(recordWorkspaceOperation(session(), op()));
  assert.deepEqual(captured, {
    flow: { version: 1, steps: [{ type: "optimize.compress", area: "optimize", scope: "document", options: { mode: "quality", profile: "balanced" } }] },
    omissions: [],
  });
  const wire = serializeWorkspaceFlow(captured.flow);
  assert.equal(wire.includes("private"), false);
  assert.equal(wire.includes("10_000"), false);
  assert.equal(wire.includes("10000"), false);
  assert.deepEqual(parseWorkspaceFlow(wire), captured.flow);
});

test("exclude page-specific signatures, unrecognized eligible operations, and unexpected sensitive keys", () => {
  let s = session();
  s = recordWorkspaceOperation(s, op({ flow: { eligible: false, reason: "sensitive" } }));
  s = recordWorkspaceOperation(s, op({ type: "enhance.watermark", area: "enhance" }));
  s = recordWorkspaceOperation(s, op({ parameters: { mode: "quality", profile: "balanced", filename: "private.pdf" } }));
  const result = captureWorkspaceFlow(s);
  assert.deepEqual(result.flow.steps, []);
  assert.deepEqual(result.omissions.map(x => x.reason), ["ineligible", "unsupported-operation", "unsafe-parameters"]);
});

test("exclude document-specific target, page scopes and unrecognized quality profiles", () => {
  let s = session();
  s = recordWorkspaceOperation(s, op({ parameters: { mode: "target", profile: null, originalBytes: 10000, outputBytes: 4000 } }));
  s = recordWorkspaceOperation(s, op({ scope: { kind: "pages", pageIds: privateDocument.pages.map(p => p.id) } }));
  s = recordWorkspaceOperation(s, op({ parameters: { mode: "quality", profile: "report from Alice" } }));
  assert.deepEqual(captureWorkspaceFlow(s).omissions.map(x => x.reason), ["unsafe-parameters", "nonportable-scope", "unsafe-parameters"]);
});

test("respect undo cursor and invalidate undone branches", () => {
  let s = session();
  s = recordWorkspaceOperation(s, op({ parameters: { mode: "quality", profile: "balanced" } }));
  s = recordWorkspaceOperation(s, op({ parameters: { mode: "quality", profile: "smaller" } }));
  s = undoWorkspaceOperation(s);
  assert.deepEqual(captureWorkspaceFlow(s).flow.steps.map(x => x.options.profile), ["balanced"]);
  s = recordWorkspaceOperation(s, op({ parameters: { mode: "quality", profile: "highQuality" } }));
  assert.deepEqual(captureWorkspaceFlow(s).flow.steps.map(x => x.options.profile), ["balanced", "highQuality"]);
});

test("reject poisoned, oversize, malformed and invented Flow schemas", () => {
  const good = captureWorkspaceFlow(recordWorkspaceOperation(session(), op())).flow;
  assert.deepEqual(planWorkspaceFlow(good), good.steps);
  assert.throws(() => parseWorkspaceFlow("{"), /Invalid Flow JSON/);
  assert.throws(() => parseWorkspaceFlow("x".repeat(20_000)), /allowed size/);
  assert.throws(() => parseWorkspaceFlow(JSON.stringify({ version: 2, steps: [] })), /Unsupported Flow format/);
  assert.throws(() => parseWorkspaceFlow(JSON.stringify({ version: 1, steps: Array(21).fill(good.steps[0]) })), /20 steps/);
  assert.throws(() => parseWorkspaceFlow(JSON.stringify({ ...good, fileName: "secret.pdf" })), /Unsupported Flow format/);
  assert.throws(() => parseWorkspaceFlow(JSON.stringify({ version: 1, steps: [{ ...good.steps[0], endpoint: "https://leak.example" }] })), /Unsupported Flow step/);
  assert.throws(() => parseWorkspaceFlow(JSON.stringify({ version: 1, steps: [{ ...good.steps[0], options: { ...good.steps[0]!.options, sourceText: "private" } }] })), /Unsupported Flow options/);
});

test("Flow capture rejects server-required privacy contexts", () => {
  const s = recordWorkspaceOperation(session(), op());
  assert.throws(() => captureWorkspaceFlow({ ...s, state: { ...s.state, privacy: "server-required" } }), /Only local/);
});
