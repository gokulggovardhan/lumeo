import type { ShapedRun } from "./harfbuzzShaping.ts";
import type { ShapingReconciliation } from "./shapingReconciliation.ts";

export type ComplexShapingKind =
  | "rtl-script"
  | "joining-script"
  | "indic-script"
  | "southeast-asian-script"
  | "combining-mark"
  | "join-control"
  | "bidi-control"
  | "variation-selector";

export type ComplexShapingRequirement =
  | Readonly<{
      required: false;
      kind: null;
      reason: null;
    }>
  | Readonly<{
      required: true;
      kind: ComplexShapingKind;
      reason: string;
    }>;

function inRange(codePoint: number, start: number, end: number): boolean {
  return codePoint >= start && codePoint <= end;
}

function isCombiningMark(codePoint: number): boolean {
  return (
    inRange(codePoint, 0x0300, 0x036f) ||
    inRange(codePoint, 0x1ab0, 0x1aff) ||
    inRange(codePoint, 0x1dc0, 0x1dff) ||
    inRange(codePoint, 0x20d0, 0x20ff) ||
    inRange(codePoint, 0xfe20, 0xfe2f)
  );
}

function isRtlScript(codePoint: number): boolean {
  return (
    inRange(codePoint, 0x0590, 0x05ff) || // Hebrew
    inRange(codePoint, 0x0600, 0x06ff) || // Arabic
    inRange(codePoint, 0x0700, 0x074f) || // Syriac
    inRange(codePoint, 0x0750, 0x077f) || // Arabic Supplement
    inRange(codePoint, 0x0780, 0x07bf) || // Thaana
    inRange(codePoint, 0x07c0, 0x07ff) || // NKo
    inRange(codePoint, 0x0800, 0x083f) || // Samaritan
    inRange(codePoint, 0x0840, 0x085f) || // Mandaic
    inRange(codePoint, 0x08a0, 0x08ff) || // Arabic Extended-A
    inRange(codePoint, 0xfb1d, 0xfdff) ||
    inRange(codePoint, 0xfe70, 0xfeff)
  );
}

function isIndicScript(codePoint: number): boolean {
  return (
    inRange(codePoint, 0x0900, 0x0dff) ||
    inRange(codePoint, 0xa800, 0xabff) ||
    inRange(codePoint, 0x11000, 0x11fff)
  );
}

function isSoutheastAsianScript(codePoint: number): boolean {
  return (
    inRange(codePoint, 0x0e00, 0x0fff) || // Thai, Lao, Tibetan
    inRange(codePoint, 0x1000, 0x109f) || // Myanmar
    inRange(codePoint, 0x1780, 0x17ff) || // Khmer
    inRange(codePoint, 0x1a00, 0x1aaf) ||
    inRange(codePoint, 0xaa60, 0xaaff)
  );
}

export function detectComplexShapingRequirement(
  text: string,
): ComplexShapingRequirement {
  for (const char of text) {
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined) continue;

    if (codePoint === 0x200c || codePoint === 0x200d) {
      return {
        required: true,
        kind: "join-control",
        reason:
          "This replacement contains a join control, so its glyph selection must be shaped before native PDF export.",
      };
    }

    if (
      inRange(codePoint, 0x202a, 0x202e) ||
      inRange(codePoint, 0x2066, 0x2069)
    ) {
      return {
        required: true,
        kind: "bidi-control",
        reason:
          "This replacement contains bidirectional controls, so visual glyph order must be proven before native PDF export.",
      };
    }

    if (
      inRange(codePoint, 0xfe00, 0xfe0f) ||
      inRange(codePoint, 0xe0100, 0xe01ef)
    ) {
      return {
        required: true,
        kind: "variation-selector",
        reason:
          "This replacement uses a variation selector, so the exact font glyph must be resolved by the shaping engine first.",
      };
    }

    if (isCombiningMark(codePoint)) {
      return {
        required: true,
        kind: "combining-mark",
        reason:
          "This replacement contains combining marks whose shaped offsets must be proven before native PDF export.",
      };
    }

    if (isRtlScript(codePoint)) {
      return {
        required: true,
        kind:
          inRange(codePoint, 0x0600, 0x08ff) ||
          inRange(codePoint, 0xfb50, 0xfeff)
            ? "joining-script"
            : "rtl-script",
        reason:
          "This replacement uses a right-to-left or joining script whose glyph order/forms require canonical shaping.",
      };
    }

    if (isIndicScript(codePoint)) {
      return {
        required: true,
        kind: "indic-script",
        reason:
          "This replacement uses a script with conjunct or reordering rules, so its shaped glyph sequence must be proven first.",
      };
    }

    if (isSoutheastAsianScript(codePoint)) {
      return {
        required: true,
        kind: "southeast-asian-script",
        reason:
          "This replacement uses a script whose marks/clusters require canonical shaping before native PDF export.",
      };
    }
  }

  return { required: false, kind: null, reason: null };
}

class ValidatedShapingWriteEvidenceProof {
  private readonly validationProof!: true;

  constructor() {
    Object.defineProperty(this, "validationProof", {
      value: true,
      enumerable: false,
      writable: false,
      configurable: false,
    });
  }

  isPlannerIssued(): boolean {
    return this.validationProof === true;
  }
}

export type ValidatedShapingWriteEvidence =
  Readonly<{
    replacementText: string;
    embeddedProgramSha256: string;
    engineVersion: string;
    advanceAgreement: ShapingReconciliation["advanceAgreement"];
  }> &
  ValidatedShapingWriteEvidenceProof;

export type ShapingWriteEvidenceResult =
  | Readonly<{
      kind: "validated";
      evidence: ValidatedShapingWriteEvidence;
    }>
  | Readonly<{
      kind: "blocked";
      reason: string;
    }>;

function validSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

/**
 * Converts advisory HarfBuzz reconciliation into a narrow proof that the
 * EXISTING character-code writer is equivalent for this exact replacement.
 *
 * This function does not authorize a PDF write by itself. buildEditPlan still
 * requires the PDF encoding/ToUnicode map, glyph authority, PDF widths, text
 * state and every existing native-writer guard. The proof only closes the
 * additional shaping gap for replacements that need canonical shaping.
 */
export function validateShapingEvidenceForCharacterCodeWriter({
  replacementText,
  embeddedProgramSha256,
  shaped,
  reconciliation,
}: {
  replacementText: string;
  embeddedProgramSha256: string | null | undefined;
  shaped: ShapedRun;
  reconciliation: ShapingReconciliation;
}): ShapingWriteEvidenceResult {
  if (!embeddedProgramSha256 || !validSha256(embeddedProgramSha256)) {
    return {
      kind: "blocked",
      reason:
        "The exact embedded font fingerprint is unavailable, so shaping evidence cannot be bound to this PDF font safely.",
    };
  }

  if (shaped.text !== replacementText) {
    return {
      kind: "blocked",
      reason:
        "The shaping evidence belongs to different replacement text, so it cannot authorize this edit.",
    };
  }

  if (
    !shaped.directionWasExplicit ||
    shaped.requestedDirection === "auto"
  ) {
    return {
      kind: "blocked",
      reason:
        "The shaping direction was not explicit, so glyph order cannot be bound safely to the current writer.",
    };
  }

  if (reconciliation.kind !== "compatible-character-codes") {
    return {
      kind: "blocked",
      reason: reconciliation.reason,
    };
  }

  if (
    reconciliation.requiresGlyphSubstitution ||
    reconciliation.requiresPerGlyphPositioning
  ) {
    return {
      kind: "blocked",
      reason:
        "The shaping result needs glyph substitution or per-glyph positioning that the current native writer does not emit.",
    };
  }

  const proof = Object.assign(new ValidatedShapingWriteEvidenceProof(), {
    replacementText,
    embeddedProgramSha256: embeddedProgramSha256.toLowerCase(),
    engineVersion: shaped.engineVersion,
    advanceAgreement: reconciliation.advanceAgreement,
  }) as ValidatedShapingWriteEvidence;

  Object.freeze(proof);
  return { kind: "validated", evidence: proof };
}

export function isValidatedShapingWriteEvidence(
  evidence: unknown,
): evidence is ValidatedShapingWriteEvidence {
  return (
    evidence instanceof ValidatedShapingWriteEvidenceProof &&
    evidence.isPlannerIssued() &&
    Object.isFrozen(evidence)
  );
}

export function shapingEvidenceMatchesReplacement({
  evidence,
  replacementText,
  embeddedProgramSha256,
}: {
  evidence: ValidatedShapingWriteEvidence | null | undefined;
  replacementText: string;
  embeddedProgramSha256: string | null | undefined;
}): boolean {
  return Boolean(
    evidence &&
      isValidatedShapingWriteEvidence(evidence) &&
      evidence.replacementText === replacementText &&
      embeddedProgramSha256 &&
      validSha256(embeddedProgramSha256) &&
      evidence.embeddedProgramSha256 === embeddedProgramSha256.toLowerCase(),
  );
}
