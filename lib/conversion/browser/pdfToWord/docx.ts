import JSZip from "jszip";

import { clusterVisualTextRows, type VisualTextRow } from "./structure.ts";
import type {
  ReconstructedPage,
  ReconstructedTextLine,
} from "./types.ts";

const TWIPS_PER_PT = 20;
const EMU_PER_PT = 12_700;
// Word/LibreOffice fixed-frame paragraphs render their first text baseline
// slightly below the source-PDF top box even with zero paragraph spacing.
// Measured across the privacy-safe fidelity corpus and the private acceptance
// benchmark, 0.75 pt removes that renderer inset without touching source X/Y.
const FRAME_TEXT_TOP_COMPENSATION_PT = 0.75;

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function twips(valuePt: number): number {
  return Math.max(0, Math.round(valuePt * TWIPS_PER_PT));
}

function emu(valuePt: number): number {
  return Math.max(1, Math.round(valuePt * EMU_PER_PT));
}


function wordRunProperties(
  line: ReconstructedTextLine,
  options: { fixedWidth?: boolean } = {},
): string {
  const fontSizeHalfPt = Math.max(12, Math.round(line.fontSizePt * 2));
  const family = xmlEscape(line.fontFamily || "Arial");
  const bold = line.bold ? "<w:b/>" : "";
  const italic = line.italic ? "<w:i/>" : "";
  const color = /^#[0-9A-Fa-f]{6}$/.test(line.colorHex ?? "")
    ? `<w:color w:val="${xmlEscape((line.colorHex ?? "#000000").slice(1).toUpperCase())}"/>`
    : "";
  const underlineColor =
    line.underline &&
    /^#[0-9A-Fa-f]{6}$/.test(
      line.underlineColorHex ?? line.colorHex ?? "",
    )
      ? (line.underlineColorHex ?? line.colorHex ?? "#000000")
          .slice(1)
          .toUpperCase()
      : null;
  const underline = line.underline
    ? `<w:u w:val="single"${underlineColor ? ` w:color="${xmlEscape(underlineColor)}"` : ""}/>`
    : "";
  const wordScale =
    typeof line.wordScalePct === "number" && Number.isFinite(line.wordScalePct)
      ? `<w:w w:val="${Math.max(70, Math.min(130, Math.round(line.wordScalePct)))}"/>`
      : "";
  const characterSpacing =
    typeof line.charSpacingPt === "number" &&
    Number.isFinite(line.charSpacingPt) &&
    Math.abs(line.charSpacingPt) >= 0.05
      ? `<w:spacing w:val="${Math.round(line.charSpacingPt * TWIPS_PER_PT)}"/>`
      : "";
  const textRise =
    typeof line.textRisePt === "number" &&
    Number.isFinite(line.textRisePt) &&
    Math.abs(line.textRisePt) >= 0.25
      ? `<w:position w:val="${Math.round(line.textRisePt * 2)}"/>`
      : "";
  const fitText = options.fixedWidth
    ? `<w:fitText w:val="${twips(Math.max(line.widthPt, 1))}"/>`
    : "";

  return `
      <w:rFonts w:ascii="${family}" w:hAnsi="${family}" w:cs="${family}"/>
      <w:sz w:val="${fontSizeHalfPt}"/>
      <w:szCs w:val="${fontSizeHalfPt}"/>
      ${fitText}
      ${wordScale}
      ${characterSpacing}
      ${textRise}
      ${color}
      ${underline}
      ${bold}
      ${italic}`;
}

function semanticRun(
  line: ReconstructedTextLine,
  hyperlinkRelationshipId: string | null,
  prefix = "",
): string {
  const content = `<w:r>
    <w:rPr>
      ${wordRunProperties(line)}
    </w:rPr>
    <w:t xml:space="preserve">${xmlEscape(prefix + line.text)}</w:t>
  </w:r>`;

  return hyperlinkRelationshipId
    ? `<w:hyperlink r:id="${hyperlinkRelationshipId}" w:history="1">${content}</w:hyperlink>`
    : content;
}

type SemanticParagraphPlan = {
  rows: VisualTextRow[];
  topPt: number;
  bottomPt: number;
  leftPt: number;
  rightPt: number;
};

function rowStyleSignature(
  row: VisualTextRow,
  lines: ReconstructedTextLine[],
): string {
  const line = lines[row.indices[0]];
  return [
    line?.fontFamily ?? "",
    Math.round((line?.fontSizePt ?? 0) * 4) / 4,
    line?.bold ? "b" : "",
    line?.italic ? "i" : "",
  ].join("|");
}

function canJoinSemanticRows(
  previous: VisualTextRow,
  next: VisualTextRow,
  lines: ReconstructedTextLine[],
  pageWidthPt: number,
): boolean {
  const fontSize = Math.max(
    1,
    Math.min(previous.dominantFontSizePt, next.dominantFontSizePt),
  );
  const baselineGap = next.baselinePt - previous.baselinePt;
  if (
    baselineGap < fontSize * 0.82 ||
    baselineGap > Math.max(fontSize * 1.65, fontSize + 5)
  ) {
    return false;
  }
  if (Math.abs(previous.leftPt - next.leftPt) > Math.max(3, fontSize * 0.35)) {
    return false;
  }
  if (rowStyleSignature(previous, lines) !== rowStyleSignature(next, lines)) {
    return false;
  }

  const availableWidth = Math.max(1, pageWidthPt - previous.leftPt - 24);
  const previousFill = (previous.rightPt - previous.leftPt) / availableWidth;
  return previousFill >= 0.52;
}

function inferSemanticParagraphs(
  page: ReconstructedPage,
): SemanticParagraphPlan[] {
  const indices = page.lines
    .map((line, index) => ({ line, index }))
    .filter(
      ({ line }) =>
        !line.visualOnly && line.regionKind === "semantic-text",
    )
    .map(({ index }) => index);
  const rows = clusterVisualTextRows(page.lines, indices);
  const paragraphs: SemanticParagraphPlan[] = [];

  for (const row of rows) {
    const previous = paragraphs.at(-1);
    const previousRow = previous?.rows.at(-1);
    if (
      previous &&
      previousRow &&
      canJoinSemanticRows(previousRow, row, page.lines, page.widthPt)
    ) {
      previous.rows.push(row);
      previous.topPt = Math.min(previous.topPt, row.topPt);
      previous.bottomPt = Math.max(previous.bottomPt, row.bottomPt);
      previous.leftPt = Math.min(previous.leftPt, row.leftPt);
      previous.rightPt = Math.max(previous.rightPt, row.rightPt);
      continue;
    }
    paragraphs.push({
      rows: [row],
      topPt: row.topPt,
      bottomPt: row.bottomPt,
      leftPt: row.leftPt,
      rightPt: row.rightPt,
    });
  }
  return paragraphs;
}

function semanticParagraph(
  plan: SemanticParagraphPlan,
  page: ReconstructedPage,
  beforePt: number,
  hyperlinkRels: Map<string, string>,
): string {
  const baselineGaps = plan.rows
    .slice(1)
    .map((row, index) => row.baselinePt - plan.rows[index].baselinePt)
    .filter((gap) => gap > 0);
  const firstLine = page.lines[plan.rows[0].indices[0]];
  const lineHeightPt =
    baselineGaps.length > 0
      ? baselineGaps.reduce((sum, gap) => sum + gap, 0) / baselineGaps.length
      : Math.max(firstLine.fontSizePt * 1.18, firstLine.heightPt);

  const rightIndentPt = Math.max(0, page.widthPt - plan.rightPt - 12);
  const runs: string[] = [];

  plan.rows.forEach((row, rowIndex) => {
    if (rowIndex > 0) runs.push("<w:r><w:br/></w:r>");
    let previousRight = row.leftPt;

    for (const lineIndex of row.indices) {
      const line = page.lines[lineIndex];
      const gapPt = Math.max(0, line.xPt - previousRight);
      const approximateSpacePt = Math.max(2.5, line.fontSizePt * 0.32);
      const spaces =
        gapPt > line.fontSizePt * 0.18
          ? " ".repeat(Math.min(8, Math.max(1, Math.round(gapPt / approximateSpacePt))))
          : "";
      runs.push(
        semanticRun(
          line,
          line.hyperlinkUrl
            ? hyperlinkRels.get(line.hyperlinkUrl) ?? null
            : null,
          spaces,
        ),
      );
      previousRight = Math.max(previousRight, line.xPt + line.widthPt);
    }
  });

  return `
<w:p>
  <w:pPr>
    <w:ind w:left="${twips(plan.leftPt)}" w:right="${twips(rightIndentPt)}"/>
    <w:spacing w:before="${twips(Math.max(0, beforePt))}" w:after="0" w:line="${twips(lineHeightPt)}" w:lineRule="exact"/>
    <w:keepLines/>
  </w:pPr>
  ${runs.join("\n")}
</w:p>`;
}

function looksNumericForWord(value: string): boolean {
  return /^\s*[₹$€£(+-]?\s*\d[\d\s.,:/%-]*\)?\s*$/u.test(value);
}

function semanticTable(
  page: ReconstructedPage,
  region: NonNullable<ReconstructedPage["regions"]>[number],
  hyperlinkRels: Map<string, string>,
): string {
  const anchors = region.columnAnchorsPt ?? [];
  const rows = region.rowGroups ?? [];
  if (anchors.length < 2 || rows.length < 2) return "";

  const tolerancePt = Math.max(3, page.widthPt * 0.006);
  const regionRight = region.xPt + region.widthPt;
  const boundaries = anchors.map((anchor, index) => {
    if (index === 0) return region.xPt;
    return (anchors[index - 1] + anchor) / 2;
  });
  boundaries.push(regionRight);

  const widthsPt = anchors.map((_anchor, index) =>
    Math.max(18, boundaries[index + 1] - boundaries[index]),
  );
  const tableWidthPt = widthsPt.reduce((sum, width) => sum + width, 0);

  const rowXml = rows.map((rowIndices, rowIndex) => {
    const cells: Array<ReconstructedTextLine[]> = anchors.map(() => []);
    for (const lineIndex of rowIndices) {
      const line = page.lines[lineIndex];
      let best = -1;
      let distance = Number.POSITIVE_INFINITY;
      anchors.forEach((anchor, index) => {
        const candidate = Math.abs(line.xPt - anchor);
        if (candidate <= tolerancePt && candidate < distance) {
          best = index;
          distance = candidate;
        }
      });
      if (best >= 0) cells[best].push(line);
    }

    const nextRow = rows[rowIndex + 1];
    const currentBaseline = Math.min(
      ...rowIndices.map(
        (index) =>
          page.lines[index].baselinePt ??
          page.lines[index].yPt + page.lines[index].heightPt * 0.85,
      ),
    );
    const nextBaseline = nextRow
      ? Math.min(
          ...nextRow.map(
            (index) =>
              page.lines[index].baselinePt ??
              page.lines[index].yPt + page.lines[index].heightPt * 0.85,
          ),
        )
      : currentBaseline +
        Math.max(...rowIndices.map((index) => page.lines[index].fontSizePt)) *
          1.35;
    const rowHeightPt = Math.max(10, nextBaseline - currentBaseline);

    const cellXml = cells.map((cellLines, columnIndex) => {
      const ordered = [...cellLines].sort((a, b) => a.xPt - b.xPt);
      const rightAligned =
        ordered.length > 0 &&
        ordered.every((line) => looksNumericForWord(line.text));
      const content =
        ordered.length > 0
          ? ordered
              .map((line, index) =>
                semanticRun(
                  line,
                  line.hyperlinkUrl
                    ? hyperlinkRels.get(line.hyperlinkUrl) ?? null
                    : null,
                  index > 0 ? " " : "",
                ),
              )
              .join("\n")
          : "<w:r><w:t></w:t></w:r>";
      return `
      <w:tc>
        <w:tcPr>
          <w:tcW w:w="${twips(widthsPt[columnIndex])}" w:type="dxa"/>
          <w:tcMar><w:top w:w="0" w:type="dxa"/><w:left w:w="24" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="24" w:type="dxa"/></w:tcMar>
        </w:tcPr>
        <w:p>
          <w:pPr>
            <w:spacing w:before="0" w:after="0"/>
            ${rightAligned ? '<w:jc w:val="right"/>' : ""}
          </w:pPr>
          ${content}
        </w:p>
      </w:tc>`;
    });

    return `
    <w:tr>
      <w:trPr><w:trHeight w:val="${twips(rowHeightPt)}" w:hRule="atLeast"/></w:trPr>
      ${cellXml.join("\n")}
    </w:tr>`;
  });

  return `
<w:tbl>
  <w:tblPr>
    <w:tblW w:w="${twips(tableWidthPt)}" w:type="dxa"/>
    <w:tblLayout w:type="fixed"/>
    <w:tblpPr w:leftFromText="0" w:rightFromText="0" w:topFromText="0" w:bottomFromText="0" w:vertAnchor="page" w:horzAnchor="page" w:tblpX="${twips(region.xPt)}" w:tblpY="${twips(region.yPt)}"/>
    <w:tblLook w:val="0000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/>
  </w:tblPr>
  <w:tblGrid>
    ${widthsPt.map((width) => `<w:gridCol w:w="${twips(width)}"/>`).join("\n")}
  </w:tblGrid>
  ${rowXml.join("\n")}
</w:tbl>`;
}

function lineParagraph(
  line: ReconstructedTextLine,
  useOpaqueBackground: boolean,
  pageWidthPt: number,
  hyperlinkRelationshipId: string | null = null,
): string {
  const fontSizeHalfPt = Math.max(12, Math.round(line.fontSizePt * 2));
  const family = xmlEscape(line.fontFamily || "Arial");
  const shade = useOpaqueBackground
    ? '<w:shd w:val="clear" w:color="auto" w:fill="FFFFFF"/>'
    : "";
  const bold = line.bold ? "<w:b/>" : "";
  const italic = line.italic ? "<w:i/>" : "";
  const color = /^#[0-9A-Fa-f]{6}$/.test(line.colorHex ?? "")
    ? `<w:color w:val="${xmlEscape((line.colorHex ?? "#000000").slice(1).toUpperCase())}"/>`
    : "";
  const underlineColor =
    line.underline && /^#[0-9A-Fa-f]{6}$/.test(line.underlineColorHex ?? line.colorHex ?? "")
      ? (line.underlineColorHex ?? line.colorHex ?? "#000000").slice(1).toUpperCase()
      : null;
  const underline = line.underline
    ? `<w:u w:val="single"${underlineColor ? ` w:color="${xmlEscape(underlineColor)}"` : ""}/>`
    : "";
  const wordScale =
    typeof line.wordScalePct === "number" && Number.isFinite(line.wordScalePct)
      ? `<w:w w:val="${Math.max(70, Math.min(130, Math.round(line.wordScalePct)))}"/>`
      : "";
  // A PDF run's measured advance is often a few points narrower than the
  // width Word needs after font substitution. A narrow frame therefore turns
  // one fixed-layout run into two flowing lines. Give the frame the remaining
  // page width; the run itself still starts at its exact PDF X coordinate and
  // Word is free to use only as much horizontal space as its glyphs require.
  const frameWidthPt = Math.max(
    pageWidthPt - line.xPt - 6,
    line.widthPt + Math.max(12, line.fontSizePt * 1.5),
    8,
  );

  return `
<w:p>
  <w:pPr>
    <w:framePr
      w:w="${twips(frameWidthPt)}"
      w:h="${twips(Math.max(line.heightPt, line.fontSizePt * 1.2))}"
      w:hRule="atLeast"
      w:x="${twips(line.xPt)}"
      w:y="${twips(Math.max(0, line.yPt - FRAME_TEXT_TOP_COMPENSATION_PT))}"
      w:hAnchor="page"
      w:vAnchor="page"
      w:wrap="notBeside"/>
    <w:spacing w:before="0" w:after="0" w:line="${twips(line.fontSizePt * 1.15)}" w:lineRule="exact"/>
    ${shade}
  </w:pPr>
  ${hyperlinkRelationshipId ? `<w:hyperlink r:id="${hyperlinkRelationshipId}" w:history="1">` : ""}
  <w:r>
    <w:rPr>
      <w:rFonts w:ascii="${family}" w:hAnsi="${family}" w:cs="${family}"/>
      <w:sz w:val="${fontSizeHalfPt}"/>
      <w:szCs w:val="${fontSizeHalfPt}"/>
      <w:fitText w:val="${twips(Math.max(line.widthPt, 1))}"/>
      ${wordScale}
      ${color}
      ${underline}
      ${bold}
      ${italic}
    </w:rPr>
    <w:t xml:space="preserve">${xmlEscape(line.text)}</w:t>
  </w:r>
  ${hyperlinkRelationshipId ? "</w:hyperlink>" : ""}
</w:p>`;
}

function imageParagraph(
  relationshipId: string,
  page: ReconstructedPage,
  imageId: number,
): string {
  return `
<w:p>
  <w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr>
  <w:r>
    <w:drawing>
      <wp:anchor
        distT="0"
        distB="0"
        distL="0"
        distR="0"
        simplePos="0"
        relativeHeight="0"
        behindDoc="1"
        locked="0"
        layoutInCell="1"
        allowOverlap="1">
        <wp:simplePos x="0" y="0"/>
        <wp:positionH relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionH>
        <wp:positionV relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionV>
        <wp:extent cx="${emu(page.widthPt)}" cy="${emu(page.heightPt)}"/>
        <wp:effectExtent l="0" t="0" r="0" b="0"/>
        <wp:wrapNone/>
        <wp:docPr id="${imageId}" name="Page ${page.pageNumber} background"/>
        <wp:cNvGraphicFramePr/>
        <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
              <pic:nvPicPr>
                <pic:cNvPr id="0" name="page-${page.pageNumber}"/>
                <pic:cNvPicPr/>
              </pic:nvPicPr>
              <pic:blipFill>
                <a:blip r:embed="${relationshipId}"/>
                <a:stretch><a:fillRect/></a:stretch>
              </pic:blipFill>
              <pic:spPr>
                <a:xfrm>
                  <a:off x="0" y="0"/>
                  <a:ext cx="${emu(page.widthPt)}" cy="${emu(page.heightPt)}"/>
                </a:xfrm>
                <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
              </pic:spPr>
            </pic:pic>
          </a:graphicData>
        </a:graphic>
      </wp:anchor>
    </w:drawing>
  </w:r>
</w:p>`;
}

function sectionProperties(page: ReconstructedPage, nextPage: boolean): string {
  return `
<w:sectPr>
  ${nextPage ? '<w:type w:val="nextPage"/>' : ""}
  <w:pgSz w:w="${twips(page.widthPt)}" w:h="${twips(page.heightPt)}"/>
  <w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/>
</w:sectPr>`;
}

function documentXml(
  pages: ReconstructedPage[],
  imageRels: Map<number, string>,
  hyperlinkRels: Map<string, string>,
): string {
  const body: string[] = [];

  pages.forEach((page, index) => {
    const rel = imageRels.get(page.pageNumber);
    if (rel) body.push(imageParagraph(rel, page, page.pageNumber));

    const semanticTables = (page.regions ?? []).filter(
      (region) => region.kind === "semantic-table",
    );
    const tableLineIndices = new Set(
      semanticTables.flatMap((region) => region.lineIndices),
    );

    const semanticParagraphPlans =
      page.reconstructionMode === "semantic-text" && !rel
        ? inferSemanticParagraphs(page)
        : [];
    const semanticLineIndices = new Set(
      semanticParagraphPlans.flatMap((plan) =>
        plan.rows.flatMap((row) => row.indices),
      ),
    );

    type PageBlock =
      | { kind: "paragraph"; yPt: number; plan: SemanticParagraphPlan }
      | {
          kind: "table";
          yPt: number;
          region: NonNullable<ReconstructedPage["regions"]>[number];
        }
      | { kind: "fixed"; yPt: number; line: ReconstructedTextLine };

    const blocks: PageBlock[] = [
      ...semanticParagraphPlans.map(
        (plan): PageBlock => ({
          kind: "paragraph",
          yPt: plan.topPt,
          plan,
        }),
      ),
      ...semanticTables.map(
        (region): PageBlock => ({
          kind: "table",
          yPt: region.yPt,
          region,
        }),
      ),
      ...page.lines
        .map((line, lineIndex) => ({ line, lineIndex }))
        .filter(
          ({ line, lineIndex }) =>
            !line.visualOnly &&
            !semanticLineIndices.has(lineIndex) &&
            !tableLineIndices.has(lineIndex),
        )
        .map(
          ({ line }): PageBlock => ({
            kind: "fixed",
            yPt: line.yPt,
            line,
          }),
        ),
    ].sort((a, b) => a.yPt - b.yPt);

    let semanticCursorBottomPt = 0;
    for (const block of blocks) {
      if (block.kind === "paragraph") {
        body.push(
          semanticParagraph(
            block.plan,
            page,
            Math.max(0, block.plan.topPt - semanticCursorBottomPt),
            hyperlinkRels,
          ),
        );
        semanticCursorBottomPt = block.plan.bottomPt;
        continue;
      }
      if (block.kind === "table") {
        body.push(semanticTable(page, block.region, hyperlinkRels));
        continue;
      }
      body.push(
        lineParagraph(
          block.line,
          Boolean(rel) && !page.backgroundTextMasked,
          page.widthPt,
          block.line.hyperlinkUrl
            ? hyperlinkRels.get(block.line.hyperlinkUrl) ?? null
            : null,
        ),
      );
    }

    if (index < pages.length - 1) {
      body.push(`<w:p><w:pPr>${sectionProperties(page, true)}</w:pPr></w:p>`);
    }
  });

  const last = pages.at(-1) ?? {
    pageNumber: 1,
    widthPt: 612,
    heightPt: 792,
    lines: [],
  };

  body.push(sectionProperties(last, false));

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    ${body.join("\n")}
  </w:body>
</w:document>`;
}

export async function buildReconstructedDocx(
  pages: ReconstructedPage[],
): Promise<Blob> {
  const zip = new JSZip();
  const imageRelationships: string[] = [];
  const imageRels = new Map<number, string>();
  const hyperlinkRelationships: string[] = [];
  const hyperlinkRels = new Map<string, string>();

  let hyperlinkIndex = 1;
  for (const page of pages) {
    for (const line of page.lines) {
      const url = line.hyperlinkUrl;
      if (!url || hyperlinkRels.has(url)) continue;
      const relationshipId = `rIdHyperlink${hyperlinkIndex}`;
      hyperlinkRels.set(url, relationshipId);
      hyperlinkRelationships.push(
        `<Relationship Id="${relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xmlEscape(url)}" TargetMode="External"/>`,
      );
      hyperlinkIndex += 1;
    }
  }

  let imageIndex = 1;
  for (const page of pages) {
    if (!page.backgroundImage) continue;

    const extension = page.backgroundExtension ?? "jpg";
    const relationshipId = `rIdImage${imageIndex}`;
    const target = `media/page-${page.pageNumber}.${extension}`;
    const imageBytes = new Uint8Array(
      await page.backgroundImage.arrayBuffer(),
    );
    zip.file(`word/${target}`, imageBytes);
    imageRels.set(page.pageNumber, relationshipId);
    imageRelationships.push(
      `<Relationship Id="${relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${target}"/>`,
    );
    imageIndex += 1;
  }

  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`,
  );

  zip.folder("_rels")?.file(
    ".rels",
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`,
  );

  zip.folder("word")?.file(
    "document.xml",
    documentXml(pages, imageRels, hyperlinkRels),
  );
  zip.folder("word")?.file(
    "styles.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:rPr>
      <w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>
      <w:sz w:val="22"/>
      <w:szCs w:val="22"/>
    </w:rPr>
  </w:style>
</w:styles>`,
  );

  zip.folder("word")?.folder("_rels")?.file(
    "document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  ${imageRelationships.join("\n")}
  ${hyperlinkRelationships.join("\n")}
</Relationships>`,
  );

  const now = new Date().toISOString();
  zip.folder("docProps")?.file(
    "core.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<cp:coreProperties
 xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
 xmlns:dc="http://purl.org/dc/elements/1.1/"
 xmlns:dcterms="http://purl.org/dc/terms/"
 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>Lumeo reconstructed document</dc:title>
  <dc:creator>Lumeo</dc:creator>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`,
  );
  zip.folder("docProps")?.file(
    "app.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
  <Application>Lumeo</Application>
</Properties>`,
  );

  return zip.generateAsync({
    streamFiles: true,
    type: "blob",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}
