import type {
  ConversionEngine,
  ConversionInput,
  ConversionOptions,
  ConversionResult,
} from "@/lib/conversion/types";

/**
 * Stable boundary between converter UI and a concrete conversion engine.
 *
 * Browser engines stay isolated from React pages so the UI does not need to
 * know about WASM, OPFS, PDF.js, LibreOffice, or OCR implementation details.
 */
export class ConversionCoordinator {
  constructor(private readonly engine: ConversionEngine) {}

  convert(
    input: ConversionInput,
    options: ConversionOptions,
    signal: AbortSignal,
  ): Promise<ConversionResult> {
    return this.engine.convert(input, options, signal);
  }
}
