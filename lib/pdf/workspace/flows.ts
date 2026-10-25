/**
 * Lumeo Flows v1: privacy-first, explicit, non-executing template foundation.
 * Never copy a source document, filename, identifiers, or arbitrary operation
 * parameters into a reusable Flow. Execution adapters are intentionally out
 * of scope until separately implemented and verified.
 */
import type { WorkspaceOperation } from "./model.ts";
import type { DocumentSession } from "./session.ts";

export type WorkspaceFlowStepV1 = Readonly<{
  type: "optimize.compress";
  area: "optimize";
  scope: "document";
  options: Readonly<{ mode: "quality"; profile: "highQuality" | "balanced" | "smaller" }>;
}>;

export type WorkspaceFlowV1 = Readonly<{
  version: 1;
  steps: readonly WorkspaceFlowStepV1[];
}>;

export type WorkspaceFlowOmission = Readonly<{
  operationIndex: number;
  reason: "ineligible" | "unsupported-operation" | "nonportable-scope" | "unsafe-parameters";
}>;

export type WorkspaceFlowCapture = Readonly<{
  flow: WorkspaceFlowV1;
  omissions: readonly WorkspaceFlowOmission[];
}>;

const MAX_STEPS = 20;
const MAX_FLOW_BYTES = 16 * 1024;
const PROFILES = new Set(["highQuality", "balanced", "smaller"]);
const METRIC_KEYS = new Set(["mode", "profile", "originalBytes", "outputBytes"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, required: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === required.length && required.every((key) => Object.hasOwn(value, key));
}

function makePortableStep(operation: WorkspaceOperation):
  | { step: WorkspaceFlowStepV1 }
  | { reason: WorkspaceFlowOmission["reason"] } {
  if (!operation.flow.eligible || operation.flow.version !== 1) {
    return { reason: "ineligible" };
  }
  if (operation.type !== "optimize.compress" || operation.area !== "optimize") {
    return { reason: "unsupported-operation" };
  }
  if (operation.scope.kind !== "document") {
    return { reason: "nonportable-scope" };
  }

  const p = operation.parameters;
  // Fail closed if a future producer adds content, source IDs or private data.
  if (!isRecord(p) || Object.keys(p).some((key) => !METRIC_KEYS.has(key))) {
    return { reason: "unsafe-parameters" };
  }
  if (p.mode !== "quality" || !PROFILES.has(p.profile as string)) {
    // Target size is document-specific and the current adapter doesn't record
    // its request; never infer one from observed output file size.
    return { reason: "unsafe-parameters" };
  }
  if (
    (p.originalBytes !== undefined && ((typeof p.originalBytes !== "number" || !Number.isSafeInteger(p.originalBytes)) || (p.originalBytes as number) < 0)) ||
    (p.outputBytes !== undefined && ((typeof p.outputBytes !== "number" || !Number.isSafeInteger(p.outputBytes)) || (p.outputBytes as number) < 0))
  ) {
    return { reason: "unsafe-parameters" };
  }
  return {
    step: {
      type: "optimize.compress",
      area: "optimize",
      scope: "document",
      options: { mode: "quality", profile: p.profile as WorkspaceFlowStepV1["options"]["profile"] },
    },
  };
}

/** Use applied history only: undone operations must never leak into a Flow. */
export function captureWorkspaceFlow(session: DocumentSession): WorkspaceFlowCapture {
  if (session.state.privacy !== "local") {
    throw new Error("Only local document operations can be captured as a Flow.");
  }
  if (
    !Number.isSafeInteger(session.history.cursor) ||
    session.history.cursor < 0 ||
    session.history.cursor > session.history.operations.length
  ) {
    throw new Error("Workspace operation cursor is invalid.");
  }
  const steps: WorkspaceFlowStepV1[] = [];
  const omissions: WorkspaceFlowOmission[] = [];
  for (const [operationIndex, operation] of session.history.operations.slice(0, session.history.cursor).entries()) {
    const result = makePortableStep(operation);
    if ("reason" in result) {
      omissions.push({ operationIndex, reason: result.reason });
    } else if (steps.length < MAX_STEPS) {
      steps.push(result.step);
    } else {
      omissions.push({ operationIndex, reason: "unsupported-operation" });
    }
  }
  return { flow: { version: 1, steps }, omissions };
}

/**
 * Validate untrusted saved/imported Flow data without executing it. The v1
 * schema is deliberately narrow; no arbitrary handlers, URLs, or raw PDF data.
 */
export function parseWorkspaceFlow(json: string): WorkspaceFlowV1 {
  if (typeof json !== "string" || BufferByteLength(json) > MAX_FLOW_BYTES) {
    throw new RangeError("Flow template exceeds the allowed size.");
  }
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error("Invalid Flow JSON.");
  }
  if (!isRecord(value) || !exactKeys(value, ["version", "steps"]) || value.version !== 1 || !Array.isArray(value.steps)) {
    throw new Error("Unsupported Flow format.");
  }
  if (value.steps.length > MAX_STEPS) throw new RangeError("Flow exceeds 20 steps.");
  const steps: WorkspaceFlowStepV1[] = [];
  for (const candidate of value.steps) {
    if (!isRecord(candidate) || !exactKeys(candidate, ["type", "area", "scope", "options"])) {
      throw new Error("Unsupported Flow step.");
    }
    if (candidate.type !== "optimize.compress" || candidate.area !== "optimize" || candidate.scope !== "document") {
      throw new Error("Unsupported Flow step.");
    }
    const options = candidate.options;
    if (!isRecord(options) || !exactKeys(options, ["mode", "profile"]) || options.mode !== "quality" || !PROFILES.has(options.profile as string)) {
      throw new Error("Unsupported Flow options.");
    }
    steps.push({
      type: "optimize.compress",
      area: "optimize",
      scope: "document",
      options: { mode: "quality", profile: options.profile as WorkspaceFlowStepV1["options"]["profile"] },
    });
  }
  return { version: 1, steps };
}

function BufferByteLength(value: string): number {
  // TextEncoder is available in modern browsers and Node. Count UTF-8 bytes,
  // not UTF-16 code units; avoid importing Node buffers into client code.
  return new TextEncoder().encode(value).length;
}

export function serializeWorkspaceFlow(flow: WorkspaceFlowV1): string {
  return JSON.stringify(parseWorkspaceFlow(JSON.stringify(flow)));
}

/** An explicit planning boundary: this returns data, never mutates a PDF. */
export function planWorkspaceFlow(flow: WorkspaceFlowV1): readonly WorkspaceFlowStepV1[] {
  return parseWorkspaceFlow(JSON.stringify(flow)).steps;
}
