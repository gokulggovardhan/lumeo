import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { AaeEvidence } from "./types.ts";

type OrderedXmlNode = Record<string, unknown>;
type KeyValue = { key: string; value: string };

function nodeText(value: unknown): string {
  if (!Array.isArray(value)) return "";
  for (const entry of value) {
    if (entry && typeof entry === "object" && "#text" in entry) {
      const text = (entry as Record<string, unknown>)["#text"];
      if (typeof text === "string" || typeof text === "number" || typeof text === "boolean") return String(text);
    }
  }
  return "";
}

function collectPlistPairs(value: unknown, output: KeyValue[] = []): KeyValue[] {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const node = value[index];
      if (!node || typeof node !== "object") continue;
      const typed = node as OrderedXmlNode;
      if ("key" in typed) {
        const key = nodeText(typed.key).trim();
        const next = value[index + 1];
        if (key && next && typeof next === "object") {
          const nextRecord = next as OrderedXmlNode;
          const scalarTag = ["string", "integer", "real", "date", "data", "true", "false"].find((tag) => tag in nextRecord);
          if (scalarTag) output.push({ key, value: scalarTag === "true" || scalarTag === "false" ? scalarTag : nodeText(nextRecord[scalarTag]).trim() });
        }
      }
      for (const nested of Object.values(typed)) collectPlistPairs(nested, output);
    }
  } else if (value && typeof value === "object") {
    for (const nested of Object.values(value as OrderedXmlNode)) collectPlistPairs(nested, output);
  }
  return output;
}

function valuesMatching(pairs: KeyValue[], pattern: RegExp): string[] {
  return [...new Set(pairs.filter(({ key }) => pattern.test(key)).map(({ value }) => value).filter(Boolean))];
}

function operationKeys(pairs: KeyValue[]): string[] {
  const signal = /(adjust|crop|rotate|rotation|orientation|exposure|brightness|contrast|saturation|vibrance|color|filter|effect|tone|curve|vignette|sharp|noise|perspective|straighten|depth|portrait|repair|markup)/i;
  const administrative = /^(adjustmentFormatIdentifier|adjustmentFormatVersion|adjustmentBaseVersion|adjustmentData|adjustmentXML|formatVersion|version)$/i;
  return [...new Set(pairs.filter(({ key }) => signal.test(key) && !administrative.test(key)).map(({ key }) => key))].sort();
}

export function inspectAaeXml(xml: string): AaeEvidence {
  const base: AaeEvidence = {
    present: true,
    parseStatus: "failed",
    adjustmentFormat: null,
    adjustmentVersion: null,
    adjustmentIdentifiers: [],
    adjustmentXML: null,
    detectedOperations: [],
    cropRotationEvidence: [],
    exposureColorEvidence: [],
    filterEvidence: [],
    unknownAdjustments: [],
    classification: "unknown",
    evidence: [],
  };

  const validation = XMLValidator.validate(xml);
  if (validation !== true) {
    return { ...base, parseStatus: "malformed", evidence: ["AAE XML validation failed; the group was retained and inspection continued."] };
  }

  try {
    const parser = new XMLParser({ preserveOrder: true, ignoreAttributes: false, parseTagValue: false, trimValues: true });
    const parsed: unknown = parser.parse(xml);
    const pairs = collectPlistPairs(parsed);
    const operations = operationKeys(pairs);
    const known = /(format|version|identifier|adjustmentxml|adjustmentdata|crop|rotate|rotation|orientation|exposure|brightness|contrast|saturation|vibrance|color|filter|effect|tone|curve|vignette|sharp|noise|perspective|straighten|depth|portrait|repair|markup)/i;
    const unknownAdjustments = pairs.filter(({ key }) => /adjust/i.test(key) && !known.test(key)).slice(0, 100);
    const evidence = [`AAE XML parsed successfully with ${pairs.length} plist key/value pairs.`];
    if (operations.length > 0) evidence.push(`Observed adjustment-related keys: ${operations.join(", ")}.`);
    evidence.push("No trusted rendered reference was supplied; duplicate/baked status cannot be proven from XML alone.");
    return {
      present: true,
      parseStatus: "parsed",
      adjustmentFormat: valuesMatching(pairs, /adjustmentFormatIdentifier|adjustmentFormat$/i)[0] ?? null,
      adjustmentVersion: valuesMatching(pairs, /adjustmentFormatVersion|adjustmentVersion|version$/i)[0] ?? null,
      adjustmentIdentifiers: valuesMatching(pairs, /identifier/i),
      adjustmentXML: valuesMatching(pairs, /^adjustmentXML$/i)[0] ?? null,
      detectedOperations: operations,
      cropRotationEvidence: operations.filter((key) => /(crop|rotat|orientation|straighten|perspective)/i.test(key)),
      exposureColorEvidence: operations.filter((key) => /(exposure|brightness|contrast|saturation|vibrance|color|tone|curve)/i.test(key)),
      filterEvidence: operations.filter((key) => /(filter|effect)/i.test(key)),
      unknownAdjustments,
      classification: operations.length > 0 ? "possible-unbaked-delta" : "unknown",
      evidence,
    };
  } catch (error) {
    return { ...base, parseStatus: "failed", evidence: [`AAE parsing failed safely: ${error instanceof Error ? error.name : "UnknownError"}.`] };
  }
}

export function noAaeEvidence(): AaeEvidence {
  return {
    present: false,
    parseStatus: "not-present",
    adjustmentFormat: null,
    adjustmentVersion: null,
    adjustmentIdentifiers: [],
    adjustmentXML: null,
    detectedOperations: [],
    cropRotationEvidence: [],
    exposureColorEvidence: [],
    filterEvidence: [],
    unknownAdjustments: [],
    classification: "unknown",
    evidence: ["No AAE companion was observed in this basename group."],
  };
}
