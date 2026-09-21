import JSZip from "jszip";

import type {
  ReconstructedPage,
  ReconstructedTextLine,
} from "./types.ts";

const TWIPS_PER_PT = 20;
const EMU_PER_PT = 12_700;

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

function lineParagraph(
  line: ReconstructedTextLine,
  useOpaqueBackground: boolean,
  pageWidthPt: number,
): string {
  const fontSizeHalfPt = Math.max(12, Math.round(line.fontSizePt * 2));
  const family = xmlEscape(line.fontFamily || "Arial");
  const shade = useOpaqueBackground
    ? '<w:shd w:val="clear" w:color="auto" w:fill="FFFFFF"/>'
    : "";
  const bold = line.bold ? "<w:b/>" : "";
  const italic = line.italic ? "<w:i/>" : "";
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
      w:y="${twips(line.yPt)}"
      w:hAnchor="page"
      w:vAnchor="page"
      w:wrap="notBeside"/>
    <w:spacing w:before="0" w:after="0" w:line="${twips(line.fontSizePt * 1.15)}" w:lineRule="atLeast"/>
    ${shade}
  </w:pPr>
  <w:r>
    <w:rPr>
      <w:rFonts w:ascii="${family}" w:hAnsi="${family}" w:cs="${family}"/>
      <w:sz w:val="${fontSizeHalfPt}"/>
      <w:szCs w:val="${fontSizeHalfPt}"/>
      <w:fitText w:val="${twips(Math.max(line.widthPt, 1))}"/>
      ${bold}
      ${italic}
    </w:rPr>
    <w:t xml:space="preserve">${xmlEscape(line.text)}</w:t>
  </w:r>
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

function documentXml(pages: ReconstructedPage[], imageRels: Map<number, string>): string {
  const body: string[] = [];

  pages.forEach((page, index) => {
    const rel = imageRels.get(page.pageNumber);
    if (rel) body.push(imageParagraph(rel, page, page.pageNumber));

    for (const line of page.lines) {
      body.push(
        lineParagraph(
          line,
          Boolean(rel) && !page.backgroundTextMasked,
          page.widthPt,
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

  zip.folder("word")?.file("document.xml", documentXml(pages, imageRels));
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
