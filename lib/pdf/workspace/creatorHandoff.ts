/**
 * Lumeo Flows creator handoff: privacy-safe, review-only local preparation.
 *
 * This module cannot open, mutate, export or upload a PDF. It never stores
 * document identity or session history in a portable template. A later,
 * separately approved release must implement execution and user interface.
 */
import {
  captureWorkspaceFlow,
  parseWorkspaceFlow,
  planWorkspaceFlow,
  serializeWorkspaceFlow,
  type WorkspaceFlowV1,
} from "./flows.ts";
import type { DocumentSession } from "./session.ts";

export type CreatorFlowStepPreview = Readonly<{
  order: number;
  title: "Compress PDF";
  area: "optimize";
  route: "/pdf/compress";
  quality: "High quality" | "Balanced" | "Smaller file";
}>;

export type CreatorFlowDraft = Readonly<{
  kind: "local-flow-creator-draft";
  version: 1;
  templateJson: string;
  steps: readonly CreatorFlowStepPreview[];
  omittedOperationCount: number;
  requiresExplicitConfirmation: true;
}>;

export type CreatorFlowReviewHandoff = Readonly<{
  kind: "local-flow-creator-handoff";
  version: 1;
  state: "reviewed-only";
  templateJson: string;
  steps: readonly CreatorFlowStepPreview[];
  requiresNewLocalDocumentSelection: true;
  canExecuteAutomatically: false;
}>;

const QUALITY_LABELS = {
  highQuality: "High quality",
  balanced: "Balanced",
  smaller: "Smaller file",
} as const;

function isRecord(input: unknown): input is Record<string, unknown> {
  return input !== null && typeof input === "object" && !Array.isArray(input);
}

function exactKeys(input: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(input).length === keys.length && keys.every((key) => Object.hasOwn(input, key));
}

function createDraft(flow: WorkspaceFlowV1, omittedOperationCount: number): CreatorFlowDraft {
  const templateJson = serializeWorkspaceFlow(flow);
  const validatedSteps = planWorkspaceFlow(parseWorkspaceFlow(templateJson));
  if (validatedSteps.length === 0) {
    throw new Error("A creator handoff needs at least one portable Flow step.");
  }
  if (!Number.isSafeInteger(omittedOperationCount) || omittedOperationCount < 0) {
    throw new Error("Invalid omitted operation count.");
  }
  const steps: CreatorFlowStepPreview[] = validatedSteps.map((step, index) => ({
    order: index + 1,
    title: "Compress PDF",
    area: "optimize",
    route: "/pdf/compress",
    quality: QUALITY_LABELS[step.options.profile],
  }));
  return {
    kind: "local-flow-creator-draft",
    version: 1,
    templateJson,
    steps,
    omittedOperationCount,
    requiresExplicitConfirmation: true,
  };
}

/**
 * Capture only portable applied-history operations. Unsupported operations
 * are counted locally, but their text, IDs, indexes and parameters never
 * enter the creator draft.
 */
export function prepareFlowCreatorDraft(session: DocumentSession): CreatorFlowDraft {
  if (!["ready", "modified", "exported"].includes(session.state.lifecycle)) {
    throw new Error("Flow creator requires a stable local document session.");
  }
  const capture = captureWorkspaceFlow(session);
  return createDraft(capture.flow, capture.omissions.length);
}

/** Import strictly validated, data-only Flow JSON for deliberate review. */
export function importFlowCreatorDraft(templateJson: string): CreatorFlowDraft {
  return createDraft(parseWorkspaceFlow(templateJson), 0);
}

/**
 * Confirmation is an acknowledgment of a validated manual plan ONLY.
 * It cannot execute an engine, switch a tool, save a file or transmit data.
 * The current user's chosen document must be selected in a later phase.
 */
export function confirmFlowCreatorHandoff(
  draft: CreatorFlowDraft,
  explicitlyConfirmed: boolean,
): CreatorFlowReviewHandoff | null {
  if (!explicitlyConfirmed) return null;
  if (
    !isRecord(draft) ||
    !exactKeys(draft, [
      "kind", "version", "templateJson", "steps",
      "omittedOperationCount", "requiresExplicitConfirmation",
    ]) ||
    draft.kind !== "local-flow-creator-draft" ||
    draft.version !== 1 ||
    draft.requiresExplicitConfirmation !== true ||
    typeof draft.templateJson !== "string"
  ) {
    throw new Error("Invalid Flow creator draft.");
  }
  const safeDraft = createDraft(parseWorkspaceFlow(draft.templateJson), draft.omittedOperationCount as number);
  // Never confirm a view whose labels, destination or order diverge from the
  // allowlisted template. It could otherwise trick someone into consenting.
  if (JSON.stringify(draft.steps) !== JSON.stringify(safeDraft.steps)) {
    throw new Error("The Flow preview changed before confirmation.");
  }
  return {
    kind: "local-flow-creator-handoff",
    version: 1,
    state: "reviewed-only",
    templateJson: safeDraft.templateJson,
    steps: safeDraft.steps,
    requiresNewLocalDocumentSelection: true,
    canExecuteAutomatically: false,
  };
}
