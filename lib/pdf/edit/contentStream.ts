// lib/pdf/edit/contentStream.ts
//
// Phase 2 of true PDF text editing, slice 1: parse a page's content stream
// (the actual PDF operator bytes -- BT/ET, Tf, Tm, Tj/TJ/'/", etc.) and
// extract every text-showing operator with its exact byte range in the
// stream, its font/size, and its effective text-rendering matrix. This is
// what a later slice needs to (a) match a Phase-1-detected text run back to
// the specific operator that produced it, and (b) eventually replace just
// that operator's bytes in place, leaving everything else in the stream
// byte-identical.
//
// Self-contained (no project-file imports) so this can run directly under
// `node --experimental-strip-types` for tests, exactly like
// lib/pdf/edit/elements.ts and lib/pdf/edit/textRuns.ts.
//
// Scope of this slice: tokenizing + graphics-state tracking + locating
// text-show operators and their matrices. It does NOT decode glyph codes
// into readable characters (that needs the font's encoding/ToUnicode CMap,
// a separate problem) and does NOT write anything back yet.

export type ContentStreamToken =
  | { type: "number"; value: number; start: number; end: number }
  | { type: "name"; value: string; start: number; end: number }
  | { type: "literalString"; value: Uint8Array; start: number; end: number }
  | { type: "hexString"; value: Uint8Array; start: number; end: number }
  | { type: "arrayStart"; start: number; end: number }
  | { type: "arrayEnd"; start: number; end: number }
  | { type: "dictStart"; start: number; end: number }
  | { type: "dictEnd"; start: number; end: number }
  | { type: "operator"; value: string; start: number; end: number };

function isWhitespace(byte: number): boolean {
  // PDF whitespace per spec: NUL, HT, LF, FF, CR, SP.
  return byte === 0 || byte === 9 || byte === 10 || byte === 12 || byte === 13 || byte === 32;
}

function isDelimiter(byte: number): boolean {
  const char = String.fromCharCode(byte);
  return "()<>[]{}/%".includes(char);
}

// Tokenizes a decoded (already un-filtered) content-stream byte buffer.
// Deliberately tolerant: an unrecognized byte sequence is skipped rather
// than throwing, since a single malformed token must not abort parsing the
// rest of an otherwise-valid stream -- callers that need every text-show
// operator located can still get the ones that parsed cleanly.
export function tokenizeContentStream(bytes: Uint8Array): ContentStreamToken[] {
  const tokens: ContentStreamToken[] = [];
  let pos = 0;
  const length = bytes.length;

  while (pos < length) {
    const byte = bytes[pos];

    if (isWhitespace(byte)) {
      pos += 1;
      continue;
    }

    if (byte === 0x25 /* % */) {
      while (pos < length && bytes[pos] !== 10 && bytes[pos] !== 13) pos += 1;
      continue;
    }

    if (byte === 0x2f /* / */) {
      const start = pos;
      pos += 1;
      let name = "";
      while (pos < length && !isWhitespace(bytes[pos]) && !isDelimiter(bytes[pos])) {
        if (bytes[pos] === 0x23 /* # */ && pos + 2 < length) {
          const hex = String.fromCharCode(bytes[pos + 1], bytes[pos + 2]);
          const code = Number.parseInt(hex, 16);
          if (!Number.isNaN(code)) {
            name += String.fromCharCode(code);
            pos += 3;
            continue;
          }
        }
        name += String.fromCharCode(bytes[pos]);
        pos += 1;
      }
      tokens.push({ type: "name", value: name, start, end: pos });
      continue;
    }

    if (byte === 0x28 /* ( */) {
      const start = pos;
      pos += 1;
      const out: number[] = [];
      let depth = 1;
      while (pos < length && depth > 0) {
        const current = bytes[pos];
        if (current === 0x5c /* backslash */ && pos + 1 < length) {
          const next = bytes[pos + 1];
          const escapes: Record<number, number> = {
            0x6e: 10, // \n
            0x72: 13, // \r
            0x74: 9, // \t
            0x62: 8, // \b
            0x66: 12, // \f
            0x28: 0x28, // \(
            0x29: 0x29, // \)
            0x5c: 0x5c, // \\
          };
          if (next in escapes) {
            out.push(escapes[next]);
            pos += 2;
            continue;
          }
          if (next >= 0x30 && next <= 0x37) {
            // Up to 3 octal digits.
            let octal = "";
            let cursor = pos + 1;
            while (cursor < length && octal.length < 3 && bytes[cursor] >= 0x30 && bytes[cursor] <= 0x37) {
              octal += String.fromCharCode(bytes[cursor]);
              cursor += 1;
            }
            out.push(Number.parseInt(octal, 8) & 0xff);
            pos = cursor;
            continue;
          }
          if (next === 10 || next === 13) {
            // Escaped line break: line continuation, contributes nothing.
            pos += next === 13 && bytes[pos + 2] === 10 ? 3 : 2;
            continue;
          }
          out.push(next);
          pos += 2;
          continue;
        }
        if (current === 0x28) depth += 1;
        if (current === 0x29) {
          depth -= 1;
          if (depth === 0) {
            pos += 1;
            break;
          }
        }
        out.push(current);
        pos += 1;
      }
      tokens.push({ type: "literalString", value: Uint8Array.from(out), start, end: pos });
      continue;
    }

    if (byte === 0x3c /* < */ && bytes[pos + 1] === 0x3c /* < */) {
      tokens.push({ type: "dictStart", start: pos, end: pos + 2 });
      pos += 2;
      continue;
    }
    if (byte === 0x3e /* > */ && bytes[pos + 1] === 0x3e /* > */) {
      tokens.push({ type: "dictEnd", start: pos, end: pos + 2 });
      pos += 2;
      continue;
    }
    if (byte === 0x3c /* < */) {
      const start = pos;
      pos += 1;
      let hex = "";
      while (pos < length && bytes[pos] !== 0x3e) {
        if (!isWhitespace(bytes[pos])) hex += String.fromCharCode(bytes[pos]);
        pos += 1;
      }
      pos += 1; // consume '>'
      if (hex.length % 2 === 1) hex += "0";
      const out = new Uint8Array(hex.length / 2);
      for (let i = 0; i < out.length; i += 1) {
        out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16) || 0;
      }
      tokens.push({ type: "hexString", value: out, start, end: pos });
      continue;
    }

    if (byte === 0x5b /* [ */) {
      tokens.push({ type: "arrayStart", start: pos, end: pos + 1 });
      pos += 1;
      continue;
    }
    if (byte === 0x5d /* ] */) {
      tokens.push({ type: "arrayEnd", start: pos, end: pos + 1 });
      pos += 1;
      continue;
    }

    if (
      (byte >= 0x30 && byte <= 0x39) ||
      byte === 0x2b /* + */ ||
      byte === 0x2d /* - */ ||
      byte === 0x2e /* . */
    ) {
      const start = pos;
      pos += 1;
      while (pos < length && ((bytes[pos] >= 0x30 && bytes[pos] <= 0x39) || bytes[pos] === 0x2e)) pos += 1;
      const text = Buffer.from(bytes.subarray(start, pos)).toString("latin1");
      const value = Number.parseFloat(text);
      if (!Number.isNaN(value)) {
        tokens.push({ type: "number", value, start, end: pos });
        continue;
      }
      // Not actually a valid number (e.g. a bare "-" or "."); fall through
      // and treat it as an operator-like token so parsing keeps moving.
    }

    // Operator (or malformed token): consume a run of non-whitespace,
    // non-delimiter bytes as the operator keyword. Includes PDF's two
    // punctuation-only text-show operators, ' and ".
    if (byte === 0x27 /* ' */ || byte === 0x22 /* " */) {
      tokens.push({ type: "operator", value: String.fromCharCode(byte), start: pos, end: pos + 1 });
      pos += 1;
      continue;
    }
    {
      const start = pos;
      while (pos < length && !isWhitespace(bytes[pos]) && !isDelimiter(bytes[pos])) pos += 1;
      if (pos === start) {
        // A stray delimiter this tokenizer doesn't otherwise handle (e.g.
        // an unmatched '{' from a Type 4 function, never valid in a page
        // content stream) -- skip one byte so the loop always progresses.
        pos += 1;
        continue;
      }
      tokens.push({ type: "operator", value: Buffer.from(bytes.subarray(start, pos)).toString("latin1"), start, end: pos });
    }
  }

  return tokens;
}

export type Matrix2x3 = [number, number, number, number, number, number];

export const IDENTITY_MATRIX: Matrix2x3 = [1, 0, 0, 1, 0, 0];

// m1 applied after m2 -- same convention as pdfjs's Util.transform (see
// lib/pdf/edit/textRuns.ts's transformPoint2x3, which matches it exactly).
// Exported for lib/pdf/edit/formXObjects.ts, which needs the identical CTM
// composition to track graphics state across a Do operator boundary --
// reusing this proven implementation rather than re-deriving the same
// matrix math a second time (see contentStream.ts's own git history for
// how easy that composition order is to get backwards).
export function multiplyMatrix(m1: Matrix2x3, m2: Matrix2x3): Matrix2x3 {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

export type TextShowOperatorKind = "Tj" | "TJ" | "'" | '"';

export type TextShowOperator = {
  kind: TextShowOperatorKind;
  /** Byte offset of the first operand belonging to this operator invocation. */
  start: number;
  /** Byte offset just past the operator keyword itself. */
  end: number;
  /** Raw (still glyph-encoded, not decoded to readable text) string operands, in order shown. */
  strings: Uint8Array[];
  fontResourceName: string | null;
  fontSizePt: number;
  /** Text rendering matrix at the moment this operator runs: scale(Tfs*Th, Tfs) . translate(0, Trise) . Tm . CTM. */
  textRenderingMatrix: Matrix2x3;
  charSpacing: number;
  wordSpacing: number;
  horizontalScalingPct: number;
  leading: number;
  textRise: number;
  renderMode: number;
};

type TextState = {
  fontResourceName: string | null;
  fontSizePt: number;
  charSpacing: number;
  wordSpacing: number;
  horizontalScalingPct: number;
  leading: number;
  textRise: number;
  renderMode: number;
};

function defaultTextState(): TextState {
  return {
    fontResourceName: null,
    fontSizePt: 0,
    charSpacing: 0,
    wordSpacing: 0,
    horizontalScalingPct: 100,
    leading: 0,
    textRise: 0,
    renderMode: 0,
  };
}

function asNumber(token: ContentStreamToken | undefined): number {
  return token && token.type === "number" ? token.value : 0;
}

// Walks a decoded content stream's tokens, tracking the graphics-state (CTM
// via q/Q/cm) and text-state (Tf/Tc/Tw/Tz/TL/Ts/Tr, and the text/text-line
// matrices via BT/Td/TD/Tm/T*) needed to compute each text-showing
// operator's exact rendering matrix -- mirrors PDF spec section 9.4.4's
// Trm = [Tfs*Th, 0, 0, Tfs, 0, Trise] . Tm . CTM.
//
// `initialCtm` (default: identity) lets a caller seed the starting CTM
// instead of assuming this stream begins in an unrotated, untranslated
// coordinate space -- needed by lib/pdf/edit/formXObjects.ts to compute
// ABSOLUTE (page-space) rendering matrices for text inside a Form
// XObject, whose own content stream is otherwise evaluated in a
// coordinate space established by the CTM in effect where it was invoked
// (the `Do` operator) composed with the Form's own /Matrix entry -- per
// spec 8.10.1. Every existing caller omits this argument and gets
// byte-for-byte the same identity-CTM behavior as before.
export function walkTextShowOperators(bytes: Uint8Array, initialCtm: Matrix2x3 = IDENTITY_MATRIX): TextShowOperator[] {
  const tokens = tokenizeContentStream(bytes);
  const results: TextShowOperator[] = [];

  const ctmStack: Matrix2x3[] = [];
  let ctm: Matrix2x3 = initialCtm;
  let textMatrix: Matrix2x3 = IDENTITY_MATRIX;
  let textLineMatrix: Matrix2x3 = IDENTITY_MATRIX;
  const textState = defaultTextState();
  let inTextObject = false;

  let operandStart = 0;
  let operands: ContentStreamToken[] = [];

  function computeTrm(): Matrix2x3 {
    const fontScale: Matrix2x3 = [
      (textState.fontSizePt * textState.horizontalScalingPct) / 100,
      0,
      0,
      textState.fontSizePt,
      0,
      textState.textRise,
    ];
    // Trm = fontScale, then Tm, then CTM (fontScale innermost). multiplyMatrix(A, B)
    // means "B applied first, then A" (matches pdfjs's own Util.transform
    // convention -- see the comment above), so composing three stages left-
    // to-right (fontScale -> Tm -> CTM) means nesting the calls with the
    // OUTER stage as the first argument each time.
    return multiplyMatrix(ctm, multiplyMatrix(textMatrix, fontScale));
  }

  function recordTextShow(kind: TextShowOperatorKind, strings: Uint8Array[], end: number) {
    results.push({
      kind,
      start: operandStart,
      end,
      strings,
      fontResourceName: textState.fontResourceName,
      fontSizePt: textState.fontSizePt,
      textRenderingMatrix: computeTrm(),
      charSpacing: textState.charSpacing,
      wordSpacing: textState.wordSpacing,
      horizontalScalingPct: textState.horizontalScalingPct,
      leading: textState.leading,
      textRise: textState.textRise,
      renderMode: textState.renderMode,
    });
  }

  for (const token of tokens) {
    if (token.type !== "operator") {
      if (operands.length === 0) operandStart = token.start;
      operands.push(token);
      continue;
    }

    const op = token.value;

    switch (op) {
      case "q":
        ctmStack.push(ctm);
        break;
      case "Q":
        ctm = ctmStack.pop() ?? IDENTITY_MATRIX;
        break;
      case "cm": {
        const m: Matrix2x3 = [
          asNumber(operands[0]),
          asNumber(operands[1]),
          asNumber(operands[2]),
          asNumber(operands[3]),
          asNumber(operands[4]),
          asNumber(operands[5]),
        ];
        // m applied first (innermost), existing ctm applied after.
        ctm = multiplyMatrix(ctm, m);
        break;
      }
      case "BT":
        inTextObject = true;
        textMatrix = IDENTITY_MATRIX;
        textLineMatrix = IDENTITY_MATRIX;
        break;
      case "ET":
        inTextObject = false;
        break;
      case "Tc":
        textState.charSpacing = asNumber(operands[0]);
        break;
      case "Tw":
        textState.wordSpacing = asNumber(operands[0]);
        break;
      case "Tz":
        textState.horizontalScalingPct = asNumber(operands[0]);
        break;
      case "TL":
        textState.leading = asNumber(operands[0]);
        break;
      case "Ts":
        textState.textRise = asNumber(operands[0]);
        break;
      case "Tr":
        textState.renderMode = asNumber(operands[0]);
        break;
      case "Tf":
        textState.fontResourceName = operands[0]?.type === "name" ? operands[0].value : null;
        textState.fontSizePt = asNumber(operands[1]);
        break;
      case "Td": {
        const tx = asNumber(operands[0]);
        const ty = asNumber(operands[1]);
        textLineMatrix = multiplyMatrix(textLineMatrix, [1, 0, 0, 1, tx, ty]);
        textMatrix = textLineMatrix;
        break;
      }
      case "TD": {
        const tx = asNumber(operands[0]);
        const ty = asNumber(operands[1]);
        textState.leading = -ty;
        textLineMatrix = multiplyMatrix(textLineMatrix, [1, 0, 0, 1, tx, ty]);
        textMatrix = textLineMatrix;
        break;
      }
      case "Tm": {
        const m: Matrix2x3 = [
          asNumber(operands[0]),
          asNumber(operands[1]),
          asNumber(operands[2]),
          asNumber(operands[3]),
          asNumber(operands[4]),
          asNumber(operands[5]),
        ];
        textMatrix = m;
        textLineMatrix = m;
        break;
      }
      case "T*":
        textLineMatrix = multiplyMatrix(textLineMatrix, [1, 0, 0, 1, 0, -textState.leading]);
        textMatrix = textLineMatrix;
        break;
      case "Tj":
        if (inTextObject && operands[0]?.type === "literalString") {
          recordTextShow("Tj", [operands[0].value], token.end);
        } else if (inTextObject && operands[0]?.type === "hexString") {
          recordTextShow("Tj", [operands[0].value], token.end);
        }
        break;
      case "'": {
        textLineMatrix = multiplyMatrix(textLineMatrix, [1, 0, 0, 1, 0, -textState.leading]);
        textMatrix = textLineMatrix;
        const stringToken = operands[0];
        if (inTextObject && (stringToken?.type === "literalString" || stringToken?.type === "hexString")) {
          recordTextShow("'", [stringToken.value], token.end);
        }
        break;
      }
      case '"': {
        textState.wordSpacing = asNumber(operands[0]);
        textState.charSpacing = asNumber(operands[1]);
        textLineMatrix = multiplyMatrix(textLineMatrix, [1, 0, 0, 1, 0, -textState.leading]);
        textMatrix = textLineMatrix;
        const stringToken = operands[2];
        if (inTextObject && (stringToken?.type === "literalString" || stringToken?.type === "hexString")) {
          recordTextShow('"', [stringToken.value], token.end);
        }
        break;
      }
      case "TJ": {
        const arrayTokens = operands.filter(
          (item): item is Extract<ContentStreamToken, { type: "literalString" | "hexString" }> =>
            item.type === "literalString" || item.type === "hexString",
        );
        if (inTextObject && arrayTokens.length > 0) {
          recordTextShow(
            "TJ",
            arrayTokens.map((item) => item.value),
            token.end,
          );
        }
        break;
      }
      default:
        break;
    }

    operands = [];
  }

  return results;
}
