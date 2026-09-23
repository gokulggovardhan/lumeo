import JSZip from "jszip";

function xml(lines: string[]): string {
  return lines.join("\n");
}

export async function makeAdvancedLayoutDocx(): Promise<Buffer> {
  const zip = new JSZip();

  zip.file(
    "[Content_Types].xml",
    xml([
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
      '  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
      '  <Default Extension="xml" ContentType="application/xml"/>',
      '  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
      '  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>',
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
      '    <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/></w:rPr>',
      '  </w:style>',
      '</w:styles>',
    ]),
  );

  zip.folder("word")?.folder("_rels")?.file(
    "document.xml.rels",
    xml([
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
      '  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
      '</Relationships>',
    ]),
  );

  zip.folder("word")?.file(
    "document.xml",
    xml([
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:v="urn:schemas-microsoft-com:vml">',
      '  <w:body>',
      '    <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="34"/></w:rPr><w:t>Advanced multi-column fidelity fixture</w:t></w:r></w:p>',
      '    <w:p><w:r><w:t>First column content begins with ordinary paragraph flow and stable margins.</w:t></w:r></w:p>',
      '    <w:p><w:r><w:t>First column second paragraph validates spacing before the explicit column break.</w:t></w:r></w:p>',
      '    <w:p><w:r><w:br w:type="column"/></w:r></w:p>',
      '    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Second column content begins here</w:t></w:r></w:p>',
      '    <w:p><w:r><w:t>Second column body text must remain on the right-hand side of the page.</w:t></w:r></w:p>',
      '    <w:p><w:r><w:pict><v:shape id="LumeoAdvancedShape" type="#_x0000_t202" style="width:180pt;height:42pt" strokecolor="#275DAD" fillcolor="#EAF2F8"><v:textbox inset="4pt,3pt,4pt,3pt"><w:txbxContent><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="275DAD"/></w:rPr><w:t>Vector text-box shape fixture</w:t></w:r></w:p></w:txbxContent></v:textbox></v:shape></w:pict></w:r></w:p>',
      '    <w:p><w:pPr><w:sectPr><w:type w:val="nextPage"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080"/><w:cols w:num="2" w:space="720"/></w:sectPr></w:pPr></w:p>',
      '    <w:p><w:r><w:rPr><w:b/><w:sz w:val="30"/></w:rPr><w:t>Second page after columns</w:t></w:r></w:p>',
      '    <w:p><w:r><w:t>This page verifies that the section break restores ordinary single-column flow.</w:t></w:r></w:p>',
      '    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080"/><w:cols w:num="1"/></w:sectPr>',
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
