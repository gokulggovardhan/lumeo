import JSZip from "jszip";

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8Dwn4GBgYGJAQoAHxcCAk+Uzr4AAAAASUVORK5CYII=",
  "base64",
);

function xml(lines: string[]): string {
  return lines.join("\n");
}

export async function makeProfessionalDocx(): Promise<Buffer> {
  const zip = new JSZip();

  zip.file(
    "[Content_Types].xml",
    xml([
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
      '  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
      '  <Default Extension="xml" ContentType="application/xml"/>',
      '  <Default Extension="png" ContentType="image/png"/>',
      '  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
      '  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>',
      '  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>',
      '  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>',
      '  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>',
      '</Types>',
    ]),
  );

  zip.folder("_rels")?.file(
    ".rels",
    xml([
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
      '  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>',
      '</Relationships>',
    ]),
  );

  zip.folder("word")?.file(
    "styles.xml",
    xml([
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
      '  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">',
      '    <w:name w:val="Normal"/>',
      '    <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial"/><w:sz w:val="22"/></w:rPr>',
      '  </w:style>',
      '</w:styles>',
    ]),
  );

  zip.folder("word")?.file(
    "numbering.xml",
    xml([
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
      '  <w:abstractNum w:abstractNumId="1">',
      '    <w:multiLevelType w:val="multilevel"/>',
      '    <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl>',
      '    <w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="lowerLetter"/><w:lvlText w:val="%2."/><w:pPr><w:ind w:left="1440" w:hanging="360"/></w:pPr></w:lvl>',
      '  </w:abstractNum>',
      '  <w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>',
      '</w:numbering>',
    ]),
  );

  zip.folder("word")?.file(
    "header1.xml",
    xml([
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
      '  <w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="335577"/></w:rPr><w:t>Lumeo Professional Header</w:t></w:r></w:p>',
      '</w:hdr>',
    ]),
  );

  zip.folder("word")?.file(
    "footer1.xml",
    xml([
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
      '  <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>Professional Footer · Page </w:t></w:r><w:fldSimple w:instr="PAGE"><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p>',
      '</w:ftr>',
    ]),
  );

  zip.folder("word")?.folder("media")?.file("pixel.png", ONE_PIXEL_PNG);

  zip.folder("word")?.folder("_rels")?.file(
    "document.xml.rels",
    xml([
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
      '  <Relationship Id="rIdImage1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/pixel.png"/>',
      '  <Relationship Id="rIdHeader1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>',
      '  <Relationship Id="rIdFooter1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>',
      '  <Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>',
      '  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
      '  <Relationship Id="rIdLink" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://lumeo.in" TargetMode="External"/>',
      '</Relationships>',
    ]),
  );

  zip.folder("word")?.file(
    "document.xml",
    xml([
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:v="urn:schemas-microsoft-com:vml">',
      '  <w:body>',
      '    <w:p><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:color w:val="C9903A"/><w:sz w:val="36"/></w:rPr><w:t>Professional fidelity fixture</w:t></w:r></w:p>',
      '    <w:p>',
      '      <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:i/><w:u w:val="single"/><w:sz w:val="28"/></w:rPr><w:t>Times italic underlined sample</w:t></w:r>',
      '      <w:r><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/><w:color w:val="275DAD"/><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve"> · Courier colored text</w:t></w:r>',
      '    </w:p>',
      '    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Unicode:</w:t></w:r><w:r><w:t xml:space="preserve"> नमस्ते తెలుగు 日本語 — café résumé</w:t></w:r></w:p>',
      '    <w:p><w:hyperlink r:id="rIdLink"><w:r><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr><w:t>Lumeo hyperlink</w:t></w:r></w:hyperlink></w:p>',
      '    <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Primary list item</w:t></w:r></w:p>',
      '    <w:p><w:pPr><w:numPr><w:ilvl w:val="1"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Nested list item</w:t></w:r></w:p>',
      '    <w:tbl>',
      '      <w:tblPr><w:tblW w:w="9000" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="8" w:color="333333"/><w:left w:val="single" w:sz="8" w:color="333333"/><w:bottom w:val="single" w:sz="8" w:color="333333"/><w:right w:val="single" w:sz="8" w:color="333333"/><w:insideH w:val="single" w:sz="6" w:color="777777"/><w:insideV w:val="single" w:sz="6" w:color="777777"/></w:tblBorders></w:tblPr>',
      '      <w:tblGrid><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/></w:tblGrid>',
      '      <w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Merged table heading</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Value</w:t></w:r></w:p></w:tc></w:tr>',
      '      <w:tr><w:tc><w:p><w:r><w:t>Table A1</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Table B1</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Table C1</w:t></w:r></w:p></w:tc></w:tr>',
      '    </w:tbl>',
      '    <w:p><w:r><w:t>Inline image:</w:t></w:r><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="762000" cy="762000"/><wp:docPr id="1" name="Inline fidelity image"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="pixel.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImage1"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="762000" cy="762000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>',
      '    <w:p><w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="2" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>4572000</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>4572000</wp:posOffset></wp:positionV><wp:extent cx="762000" cy="762000"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapSquare wrapText="bothSides"/><wp:docPr id="2" name="Floating fidelity image"/><wp:cNvGraphicFramePr/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="2" name="pixel.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImage1"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="762000" cy="762000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r></w:p>',
      '    <w:p><w:r><w:pict><v:shape id="LumeoTextBox" style="position:absolute;margin-left:36pt;margin-top:8pt;width:170pt;height:34pt" strokecolor="#C9903A" fillcolor="#FFF8EE"><v:textbox><w:txbxContent><w:p><w:r><w:t>Editable text box fixture</w:t></w:r></w:p></w:txbxContent></v:textbox></v:shape></w:pict></w:r></w:p>',
      '    <w:p><w:pPr><w:sectPr><w:type w:val="nextPage"/><w:headerReference w:type="default" r:id="rIdHeader1"/><w:footerReference w:type="default" r:id="rIdFooter1"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="540" w:footer="540"/></w:sectPr></w:pPr></w:p>',
      '    <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t>Landscape section content</w:t></w:r></w:p>',
      '    <w:p><w:r><w:t>This second section verifies mixed portrait and landscape pagination.</w:t></w:r></w:p>',
      '    <w:tbl><w:tblPr><w:tblW w:w="12000" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="8"/><w:bottom w:val="single" w:sz="8"/><w:insideH w:val="single" w:sz="6"/><w:insideV w:val="single" w:sz="6"/></w:tblBorders></w:tblPr><w:tr><w:tc><w:p><w:r><w:t>Landscape Table A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Landscape Table B</w:t></w:r></w:p></w:tc></w:tr></w:tbl>',
      '    <w:sectPr><w:headerReference w:type="default" r:id="rIdHeader1"/><w:footerReference w:type="default" r:id="rIdFooter1"/><w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="540" w:footer="540"/></w:sectPr>',
      '  </w:body>',
      '</w:document>',
    ]),
  );

  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}
