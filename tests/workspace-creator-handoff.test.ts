import assert from "node:assert/strict";
import test from "node:test";
import { createWorkspaceDocument, type WorkspaceOperation } from "../lib/pdf/workspace/model.ts";
import {
  confirmFlowCreatorHandoff,
  importFlowCreatorDraft,
  prepareFlowCreatorDraft,
} from "../lib/pdf/workspace/creatorHandoff.ts";
import {
  createDocumentSession,
  recordWorkspaceOperation,
  undoWorkspaceOperation,
} from "../lib/pdf/workspace/session.ts";

const document = createWorkspaceDocument("private-document-42", {
  id: "private-source-42",
  name: "private-financial-statement.pdf",
  pageCount: 3,
  byteLength: 91_000,
});

function session() {
  return createDocumentSession({ id: "private-session-42", document, initialArea: "pages" });
}

function operation(profile: string = "balanced", override: Partial<WorkspaceOperation> = {}): WorkspaceOperation {
  return {
    id: "private-operation-42",
    type: "optimize.compress",
    area: "optimize",
    description: "Secret patient financial statement",
    scope: { kind: "document" },
    parameters: { mode: "quality", profile, originalBytes: 91_000, outputBytes: 40_000 },
    undoable: true,
    affectsPreview: true,
    affectsExport: true,
    flow: { eligible: true, version: 1 },
    ...override,
  };
}

test("creator handoff derives only applied history and never persists private document content", () => {
  let s = session();
  s = recordWorkspaceOperation(s, operation("balanced"));
  s = recordWorkspaceOperation(s, operation("smaller"));
  s = undoWorkspaceOperation(s);
  const before = JSON.stringify(s);
  const draft = prepareFlowCreatorDraft(s);
  assert.equal(JSON.stringify(s), before, "Preparing a draft must not mutate the session");
  assert.equal(draft.kind, "local-flow-creator-draft");
  assert.equal(draft.requiresExplicitConfirmation, true);
  assert.equal(draft.steps.length, 1);
  assert.deepEqual(draft.steps[0], {
    order: 1, title: "Compress PDF", area: "optimize", route: "/pdf/compress", quality: "Balanced",
  });
  const serialized = JSON.stringify(draft);
  for (const secret of ["private", "financial", "patient", "91_000", "91000", "40000", "source", "document-42"]) {
    assert.equal(serialized.includes(secret), false, "Creator draft leaked " + secret);
  }
  assert.equal(serialized.includes("smaller"), false, "Undone operation entered the creator handoff");
  assert.equal(confirmFlowCreatorHandoff(draft, false), null);
  assert.equal(JSON.stringify(s), before);
});

test("explicit confirmation can only produce a reviewed manual handoff with fixed routes", () => {
  const draft = prepareFlowCreatorDraft(recordWorkspaceOperation(session(), operation("highQuality")));
  const confirmed = confirmFlowCreatorHandoff(draft, true);
  assert.deepEqual(confirmed, {
    kind: "local-flow-creator-handoff",
    version: 1,
    state: "reviewed-only",
    templateJson: draft.templateJson,
    steps: [{ order: 1, title: "Compress PDF", area: "optimize", route: "/pdf/compress", quality: "High quality" }],
    requiresNewLocalDocumentSelection: true,
    canExecuteAutomatically: false,
  });
});

test("imported portable template requires review, and rejects untrusted URLs, identities and options", () => {
  const wire = prepareFlowCreatorDraft(recordWorkspaceOperation(session(), operation())).templateJson;
  assert.deepEqual(importFlowCreatorDraft(wire).steps, [
    { order: 1, title: "Compress PDF", area: "optimize", route: "/pdf/compress", quality: "Balanced" },
  ]);
  const parsed = JSON.parse(wire);
  const bad = [
    JSON.stringify({ ...parsed, filename: "private.pdf" }),
    JSON.stringify({ ...parsed, version: 2 }),
    JSON.stringify({ ...parsed, steps: [] }),
    JSON.stringify({ ...parsed, steps: Array(21).fill(parsed.steps[0]) }),
    JSON.stringify({ ...parsed, steps: [{ ...parsed.steps[0], endpoint: "https://evil.invalid/upload" }] }),
    JSON.stringify({ ...parsed, steps: [{ ...parsed.steps[0], options: { ...parsed.steps[0].options, targetBytes: 100 } }] }),
    "not-json",
    "x".repeat(17_000),
  ];
  for (const candidate of bad) {
    assert.throws(() => importFlowCreatorDraft(candidate));
  }
});

test("cannot confirm a tampered preview or smuggle fields into the creator payload", () => {
  const draft = prepareFlowCreatorDraft(recordWorkspaceOperation(session(), operation()));
  assert.throws(() => confirmFlowCreatorHandoff({
    ...draft,
    steps: [{ ...draft.steps[0]!, route: "/admin" }],
  } as unknown as typeof draft, true), /preview changed/i);
  assert.throws(() => confirmFlowCreatorHandoff({
    ...draft,
    endpoint: "https://leak.invalid",
  } as typeof draft, true), /Invalid Flow creator draft/);
  assert.throws(() => confirmFlowCreatorHandoff({
    ...draft,
    omittedOperationCount: -2,
  }, true), /omitted operation count/);
});

test("reject non-local or unstable sessions and absent eligible Flow steps", () => {
  const s = recordWorkspaceOperation(session(), operation());
  assert.throws(
    () => prepareFlowCreatorDraft({ ...s, state: { ...s.state, privacy: "server-required" } }),
    /Only local/,
  );
  assert.throws(
    () => prepareFlowCreatorDraft({ ...s, state: { ...s.state, lifecycle: "exporting" } }),
    /stable local/,
  );
  assert.throws(() => prepareFlowCreatorDraft(session()), /at least one portable/);
  const privateOnly = recordWorkspaceOperation(session(), operation("balanced", {
    flow: { eligible: false, reason: "sensitive" },
  }));
  assert.throws(() => prepareFlowCreatorDraft(privateOnly), /at least one portable/);
});

test("counts ignored operations without carrying operation indices or descriptions into portable steps", () => {
  let s = session();
  s = recordWorkspaceOperation(s, operation("balanced", { flow: { eligible: false, reason: "sensitive" } }));
  s = recordWorkspaceOperation(s, operation("smaller"));
  s = recordWorkspaceOperation(s, operation("balanced", { scope: { kind: "pages", pageIds: document.pages.map(x => x.id) } }));
  const draft = prepareFlowCreatorDraft(s);
  assert.equal(draft.omittedOperationCount, 2);
  assert.equal(draft.steps.length, 1);
  assert.equal(draft.steps[0]?.quality, "Smaller file");
  assert.equal(draft.templateJson.includes("private"), false);
  assert.equal(draft.templateJson.includes("page"), false);
});
