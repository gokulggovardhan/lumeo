// lib/docx/parseDocumentXml.ts
//
// First slice of a browser-only DOCX engine (see project docs for the
// phased plan). This file only turns word/document.xml's body into a flat
// paragraph/run model -- no styles, numbering, tables, headers/footers,
// or images yet; those are separate, later slices.
//
// Self-contained (no project-file imports, no DOM APIs): WordprocessingML
// only needs a handful of elements recognized for this first cut (w:p,
// w:r, w:t, w:tab, w:br, and the bold/italic/underline run-property
// flags), so a small tag-scanner is used instead of a full XML parser or
// the browser's DOMParser -- the latter isn't available under Node's
// plain test runner, and pulling in an XML-parsing dependency for this
// narrow a need would be exactly the kind of unnecessary complexity this
// project avoids. A real namespace-aware parser can replace this once a
// later phase needs more of WordprocessingML than this subset.

export type DocxRun = {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
};

export type DocxParagraph = {
  runs: DocxRun[];
};

export type DocxDocument = {
  paragraphs: DocxParagraph[];
};

// Matches a start tag (with or without attributes/self-close), used to find
// each top-level element and its own closing tag by name.
function findElements(xml: string, tagName: string): string[] {
  const elements: string[] = [];
  const openTag = new RegExp(`<${tagName}(?:\\s[^>]*)?>`, "g");
  let match: RegExpExecArray | null;

  while ((match = openTag.exec(xml)) !== null) {
    const contentStart = match.index + match[0].length;
    const closeIndex = xml.indexOf(`</${tagName}>`, contentStart);
    if (closeIndex === -1) break;
    elements.push(xml.slice(contentStart, closeIndex));
    openTag.lastIndex = closeIndex + `</${tagName}>`.length;
  }

  return elements;
}

function hasSelfClosingOrEmptyElement(xml: string, tagName: string): boolean {
  return new RegExp(`<${tagName}(?:\\s[^>]*)?/?>`).test(xml);
}

// w:b/w:i/w:u (and their w:val="false"/"0" negations) live inside a run's
// w:rPr block -- WordprocessingML represents "on" as either a bare
// self-closing tag or an explicit w:val="true"/"1".
function runPropertyIsOn(rPrXml: string, tagName: string): boolean {
  const tagMatch = rPrXml.match(new RegExp(`<${tagName}([^>]*)/?>`));
  if (!tagMatch) return false;
  const attrs = tagMatch[1];
  const valMatch = attrs.match(/w:val="([^"]*)"/);
  if (!valMatch) return true;
  return valMatch[1] !== "false" && valMatch[1] !== "0";
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"');
}

function parseRun(runXml: string): DocxRun {
  const rPrMatches = findElements(runXml, "w:rPr");
  const rPrXml = rPrMatches[0] ?? "";

  const textMatches = findElements(runXml, "w:t");
  const text = textMatches.map(decodeXmlEntities).join("");
  const tabCount = (runXml.match(/<w:tab\s*\/>/g) ?? []).length;
  const breakCount = (runXml.match(/<w:br\s*\/>/g) ?? []).length;

  return {
    text: text + "\t".repeat(tabCount) + "\n".repeat(breakCount),
    bold: runPropertyIsOn(rPrXml, "w:b"),
    italic: runPropertyIsOn(rPrXml, "w:i"),
    underline: hasSelfClosingOrEmptyElement(rPrXml, "w:u") && runPropertyIsOn(rPrXml, "w:u"),
  };
}

function parseParagraph(paragraphXml: string): DocxParagraph {
  const runs = findElements(paragraphXml, "w:r")
    .map(parseRun)
    .filter((run) => run.text.length > 0);
  return { runs };
}

// Parses the already-extracted contents of word/document.xml (i.e. the
// full file, not just <w:body>) into paragraphs. Tables, headers, and
// footers are out of scope for this slice -- their paragraphs are simply
// not present in document.xml's own <w:body> in the shapes this handles
// yet (nested w:p inside w:tbl still match here, to be split out once
// table support is added rather than silently dropped).
export function parseDocumentXml(xml: string): DocxDocument {
  const bodyMatches = findElements(xml, "w:body");
  const body = bodyMatches[0] ?? xml;
  const paragraphs = findElements(body, "w:p").map(parseParagraph);
  return { paragraphs };
}
