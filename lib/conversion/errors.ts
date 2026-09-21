import type { AnalyticsErrorCode } from "@/lib/analytics/types";

export type ConversionErrorCode =
  | "unsupported-file"
  | "file-too-large"
  | "browser-unsupported"
  | "runtime-load-failed"
  | "insufficient-resources"
  | "conversion-failed"
  | "encrypted-input"
  | "malformed-input"
  | "cancelled"
  | "output-failed";

export class ConversionUserError extends Error {
  readonly code: ConversionErrorCode;
  readonly recoverable: boolean;
  readonly technicalMessage: string | null;

  constructor(
    code: ConversionErrorCode,
    message: string,
    options: {
      recoverable?: boolean;
      technicalMessage?: string | null;
    } = {},
  ) {
    super(message);
    this.name = "ConversionUserError";
    this.code = code;
    this.recoverable = options.recoverable ?? true;
    this.technicalMessage = options.technicalMessage ?? null;
  }
}

const USER_MESSAGES: Record<ConversionErrorCode, string> = {
  "unsupported-file": "This file type is not supported for this conversion.",
  "file-too-large": "This file is larger than the 250 MB local conversion limit.",
  "browser-unsupported":
    "This browser cannot run the local conversion engine. Try an up-to-date browser on a supported device.",
  "runtime-load-failed":
    "The local conversion engine could not be loaded. Check your connection and try again.",
  "insufficient-resources":
    "This device does not currently have enough browser resources for this conversion.",
  "conversion-failed":
    "The document could not be converted. Please check the file and try again.",
  "encrypted-input":
    "This document is password-protected or encrypted. Unlock it before converting.",
  "malformed-input":
    "This file appears to be damaged or incomplete. Try opening and saving it again, then retry.",
  cancelled: "Conversion cancelled.",
  "output-failed":
    "The converted file could not be finalized. Please try the conversion again.",
};

export function conversionUserError(
  code: ConversionErrorCode,
  options: {
    message?: string;
    recoverable?: boolean;
    technicalMessage?: string | null;
  } = {},
): ConversionUserError {
  return new ConversionUserError(code, options.message ?? USER_MESSAGES[code], {
    recoverable: options.recoverable,
    technicalMessage: options.technicalMessage,
  });
}

function rawMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "";
}

export function isAbortLikeError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError") ||
    /conversion cancelled|operation was aborted|aborterror/i.test(rawMessage(error))
  );
}

export function normalizeConversionError(
  error: unknown,
  context: "input" | "runtime" | "conversion" | "output" = "conversion",
): ConversionUserError {
  if (error instanceof ConversionUserError) return error;

  const detail = rawMessage(error);
  const lower = detail.toLowerCase();

  if (isAbortLikeError(error)) {
    return conversionUserError("cancelled", {
      recoverable: true,
      technicalMessage: detail || null,
    });
  }

  if (/too large|250 mb|file size/.test(lower)) {
    return conversionUserError("file-too-large", {
      recoverable: true,
      technicalMessage: detail || null,
    });
  }

  if (
    /unsupported file|not supported|use a doc|docx|odt document|word document \(\.docx/.test(
      lower,
    ) &&
    context === "input"
  ) {
    return conversionUserError("unsupported-file", {
      recoverable: true,
      technicalMessage: detail || null,
    });
  }

  if (/password|encrypted/.test(lower)) {
    return conversionUserError("encrypted-input", {
      recoverable: true,
      technicalMessage: detail || null,
    });
  }

  if (
    /cross-origin|sharedarraybuffer|isolated webassembly|wasm threads|browser cannot run|webassembly workers/.test(
      lower,
    )
  ) {
    return conversionUserError("browser-unsupported", {
      recoverable: false,
      technicalMessage: detail || null,
    });
  }

  if (
    /quota|out of memory|memory allocation|insufficient.*resource|not enough.*resource|storage.*full/.test(
      lower,
    )
  ) {
    return conversionUserError("insufficient-resources", {
      recoverable: true,
      technicalMessage: detail || null,
    });
  }

  if (
    context === "runtime" ||
    /office runtime|runtime manifest|runtime file|office helper|engine did not finish loading|engine.*unavailable|soffice|failed to initialize/.test(
      lower,
    )
  ) {
    return conversionUserError("runtime-load-failed", {
      recoverable: true,
      technicalMessage: detail || null,
    });
  }

  if (
    /invalidpdf|missingpdf|invalid pdf|malformed|corrupt|damaged|unexpected eof|bad xref/.test(
      lower,
    )
  ) {
    return conversionUserError("malformed-input", {
      recoverable: true,
      technicalMessage: detail || null,
    });
  }

  if (context === "output") {
    return conversionUserError("output-failed", {
      recoverable: true,
      technicalMessage: detail || null,
    });
  }

  return conversionUserError("conversion-failed", {
    recoverable: true,
    technicalMessage: detail || null,
  });
}

export function toAnalyticsConversionErrorCode(
  code: ConversionErrorCode,
): AnalyticsErrorCode {
  switch (code) {
    case "unsupported-file":
      return "unsupported_file";
    case "file-too-large":
      return "file_too_large";
    case "browser-unsupported":
    case "insufficient-resources":
      return "browser_limit";
    case "malformed-input":
      return "invalid_pdf";
    case "cancelled":
      return "cancelled";
    case "runtime-load-failed":
    case "conversion-failed":
    case "encrypted-input":
    case "output-failed":
      return "processing_error";
  }
}
