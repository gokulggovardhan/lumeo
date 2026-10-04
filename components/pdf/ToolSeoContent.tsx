import Link from "next/link";

type Faq = { question: string; answer: string };

type ToolSeoEntry = {
  heading: string;
  intro: string;
  detail: string;
  capabilities: readonly string[];
  faqs: readonly Faq[];
};

const TOOL_SEO: Record<string, ToolSeoEntry> = {
  "/heic-to-jpeg": {
    heading: "Private HEIC to JPEG conversion",
    intro:
      "Convert HEIC and HEIF photos from iPhone and other devices into widely compatible JPEG images without sending the photo to a remote conversion service.",
    detail:
      "Lumeo performs supported HEIC decoding in the browser. You can review the selected photos, convert a batch, and download the resulting JPEG files while keeping the original files on your device.",
    capabilities: [
      "Convert HEIC and HEIF photos to JPEG",
      "Handle multiple photos in one browser session",
      "Keep supported conversion local to the browser",
    ],
    faqs: [
      {
        question: "Are HEIC photos uploaded?",
        answer:
          "No. Supported HEIC to JPEG conversion runs in your browser, so the selected photos are not uploaded for conversion.",
      },
      {
        question: "Does conversion replace my original photo?",
        answer:
          "No. Lumeo creates a new JPEG download. The HEIC or HEIF file on your device remains unchanged.",
      },
    ],
  },
  "/pdf/merge": {
    heading: "Merge PDFs without re-uploading your documents",
    intro:
      "Merge PDF combines multiple PDF files into one document in a browser-first workflow. Add the files, arrange their order, choose the output behavior, and create one final PDF.",
    detail:
      "The merge workspace is designed for reports, statements, applications, scanned documents, and other files that need to become one ordered PDF. Supported processing stays on your device.",
    capabilities: [
      "Reorder PDFs before combining them",
      "Preserve or normalize page sizing",
      "Create one downloadable merged PDF",
    ],
    faqs: [
      {
        question: "Can I change the file order before merging?",
        answer:
          "Yes. Arrange the PDFs in the order you want before creating the merged document.",
      },
      {
        question: "Are merged PDFs uploaded to a server?",
        answer:
          "No. Supported Merge PDF processing runs in the browser and keeps the selected documents on your device.",
      },
    ],
  },
  "/pdf/split": {
    heading: "Split, extract, or remove PDF pages",
    intro:
      "Split PDF creates smaller documents from one PDF. You can extract selected pages, split by ranges, create separate files, or remove pages you do not need.",
    detail:
      "Use it when a long document needs to be shared in sections, when only a few pages are required, or when unwanted pages should be excluded from the final copy.",
    capabilities: [
      "Extract selected pages or page ranges",
      "Create multiple smaller PDF files",
      "Remove pages while preserving the original file",
    ],
    faqs: [
      {
        question: "Can I extract only selected pages?",
        answer:
          "Yes. Choose the pages or ranges you need and Lumeo creates a new PDF from those pages.",
      },
      {
        question: "Does splitting alter my original PDF?",
        answer:
          "No. The original file remains unchanged; the split or extracted documents are new downloads.",
      },
    ],
  },
  "/pdf/compress": {
    heading: "Reduce PDF size with clear quality controls",
    intro:
      "Compress PDF helps make a document easier to email, upload, or store by reducing its file size while keeping the result reviewable before you replace the original.",
    detail:
      "Compression results depend on the document. Image-heavy PDFs can often shrink more than text-only or already optimized files, so Lumeo reports the actual result rather than promising a fixed reduction.",
    capabilities: [
      "Choose an appropriate compression profile",
      "Compare the resulting file with the original",
      "Keep browser-first processing for supported PDFs",
    ],
    faqs: [
      {
        question: "Will every PDF become much smaller?",
        answer:
          "No. Already optimized or mostly text-based PDFs may have limited savings, while image-heavy documents can often be reduced more.",
      },
      {
        question: "Can compression affect quality?",
        answer:
          "Yes. Stronger compression can reduce rendering detail, so review the downloaded result before replacing an important original.",
      },
    ],
  },
  "/pdf/jpg-to-pdf": {
    heading: "Turn images into an ordered PDF",
    intro:
      "JPG to PDF combines JPG, PNG, and WebP images into one PDF document. Reorder the images, choose page settings, and generate a clean downloadable PDF.",
    detail:
      "This is useful for scanned pages, receipts, photographed documents, assignments, and other image sets that need to become a single shareable file.",
    capabilities: [
      "Mix JPG, PNG, and WebP images",
      "Reorder images before PDF creation",
      "Control page size and orientation",
    ],
    faqs: [
      {
        question: "Can I mix different image formats?",
        answer:
          "Yes. Supported JPG, PNG, and WebP images can be combined in the same PDF.",
      },
      {
        question: "Are the images uploaded?",
        answer:
          "No. Supported image-to-PDF processing runs directly in your browser.",
      },
    ],
  },
  "/pdf/pdf-to-jpg": {
    heading: "Export PDF pages as image files",
    intro:
      "PDF to JPG renders selected PDF pages as JPG, PNG, or WebP images. Choose the pages and image settings you need, then download individual images or a grouped ZIP when appropriate.",
    detail:
      "The tool is useful for previews, slide images, document thumbnails, and workflows where a PDF page needs to be used as a standard image.",
    capabilities: [
      "Select specific PDF pages for export",
      "Choose JPG, PNG, or WebP output",
      "Adjust image quality and rendering resolution",
    ],
    faqs: [
      {
        question: "Can I export only some PDF pages?",
        answer:
          "Yes. Select the page range you need before rendering the images.",
      },
      {
        question: "Does PDF to JPG create editable text?",
        answer:
          "No. The result is an image representation of the page rather than an editable document.",
      },
    ],
  },
  "/pdf/sign": {
    heading: "Add a signature or initials to a PDF",
    intro:
      "Sign PDF lets you draw or type a signature, place it on a PDF page, resize it, and position it before exporting a new signed copy.",
    detail:
      "It is intended for straightforward visual signing workflows. It does not provide a regulated electronic-signature audit trail or identity-verification service.",
    capabilities: [
      "Draw or type a signature",
      "Place and resize signatures or initials",
      "Keep supported signing work in the browser",
    ],
    faqs: [
      {
        question: "Is my signature stored by Lumeo?",
        answer:
          "No. Signatures are created and applied in the browser for the current session.",
      },
      {
        question: "Is this a certificate-based digital signature?",
        answer:
          "No. This tool places a visual signature or initials; it is not a certificate-backed digital-signature service.",
      },
    ],
  },
  "/pdf/organize": {
    heading: "Reorder, rotate, duplicate, or remove PDF pages",
    intro:
      "Organize PDF changes the page structure of one document. Reorder pages, rotate them, duplicate a page, or remove pages before exporting a new PDF.",
    detail:
      "Use it when the document is already one PDF but its page order or page selection needs correction. The original file remains unchanged on your device.",
    capabilities: [
      "Drag pages into a new order",
      "Rotate or duplicate individual pages",
      "Remove unwanted pages before export",
    ],
    faqs: [
      {
        question: "Can I undo page changes before exporting?",
        answer:
          "Yes. Workspace history lets you reverse supported page operations before you finish the PDF.",
      },
      {
        question: "Does organizing overwrite the original PDF?",
        answer:
          "No. Lumeo exports a new PDF; the source file on your device is unchanged.",
      },
    ],
  },
  "/pdf/extract-text": {
    heading: "Extract selectable text from a PDF",
    intro:
      "Extract Text reads the text layer already present in a PDF and lets you search, copy, or export that text without manually retyping the document.",
    detail:
      "It works best with digitally generated PDFs or scanned PDFs that already contain OCR text. A scan with no text layer cannot be converted into searchable text by this specific tool.",
    capabilities: [
      "Extract text from selected PDF pages",
      "Search the extracted text in the browser",
      "Export supported text results as TXT, JSON, or CSV",
    ],
    faqs: [
      {
        question: "Does Extract Text OCR a scanned page?",
        answer:
          "Not by itself. A scanned PDF needs an existing OCR text layer for this tool to extract selectable text.",
      },
      {
        question: "Can I extract only a page range?",
        answer:
          "Yes. Choose the pages you need instead of processing the entire document.",
      },
    ],
  },
  "/pdf/edit": {
    heading: "Edit and annotate a PDF in the browser",
    intro:
      "Edit PDF provides native PDF text editing where safely supported together with annotation tools such as added text, drawing, shapes, and visual whiteout.",
    detail:
      "Lumeo preserves the existing PDF editing architecture and exposes editing capability only when the document content can be handled reliably. Unsupported or invisible scan text remains protected from unsafe edits.",
    capabilities: [
      "Edit supported native PDF text",
      "Add text, drawing, shapes, and whiteout",
      "Use Workspace history to undo supported changes",
    ],
    faqs: [
      {
        question: "Does whiteout permanently redact underlying data?",
        answer:
          "No. Whiteout is visual. For sensitive documents, use a true redaction workflow that removes the underlying content before sharing.",
      },
      {
        question: "Can every PDF text run be edited?",
        answer:
          "No. Lumeo only enables native text editing when the PDF structure and font information are safe enough to preserve fidelity.",
      },
    ],
  },
  "/pdf/watermark": {
    heading: "Apply text or image watermarks to PDF pages",
    intro:
      "Watermark PDF adds text or image marks across selected pages. Control placement, angle, opacity, and page scope before exporting the updated document.",
    detail:
      "Use watermarks for draft labels, ownership marks, review status, branding, or other visible notices. PNG is recommended when an image watermark needs transparency.",
    capabilities: [
      "Add text or image watermarks",
      "Control placement, opacity, and rotation",
      "Apply to all pages or selected page ranges",
    ],
    faqs: [
      {
        question: "Can I watermark only selected pages?",
        answer:
          "Yes. Apply a watermark to all pages or restrict it to a supported custom range.",
      },
      {
        question: "Which image format is best for transparency?",
        answer:
          "Use PNG when transparency is required. JPEG images do not contain an alpha transparency channel.",
      },
    ],
  },
  "/pdf/crop": {
    heading: "Crop PDF pages to the visible area you need",
    intro:
      "Crop PDF changes the visible page bounds using a custom rectangle. Choose the crop area and apply it to the current page, selected pages, or the supported document scope.",
    detail:
      "Cropping is useful for removing unwanted margins or focusing the visible page area. It is not a security redaction method because cropped content may still exist in the underlying PDF data.",
    capabilities: [
      "Drag to define a crop rectangle",
      "Use supported aspect-ratio controls",
      "Apply the crop to selected PDF pages",
    ],
    faqs: [
      {
        question: "Does cropping permanently redact hidden content?",
        answer:
          "No. Cropping changes page bounds and visibility; it should not be used as a substitute for permanent redaction.",
      },
      {
        question: "Can I crop more than one page?",
        answer:
          "Yes. The tool can apply a selected crop area across supported page scopes.",
      },
    ],
  },
  "/pdf/page-numbers": {
    heading: "Add page numbers to a PDF",
    intro:
      "Page Numbers places consistent numbering on selected PDF pages. Choose the style, position, starting value, and page range before generating the updated document.",
    detail:
      "It is useful for reports, submissions, handouts, and long documents that need clear navigation. Preview pages with existing footer content to avoid visual overlap.",
    capabilities: [
      "Choose numbering position and style",
      "Control the starting number",
      "Apply numbering to a selected page range",
    ],
    faqs: [
      {
        question: "Can numbering start from a custom value?",
        answer:
          "Yes. Configure the starting number and the supported page range before applying it.",
      },
      {
        question: "Does numbering replace existing footer text?",
        answer:
          "No. Page numbers are added to the page, so review pages that already contain footer content for overlap.",
      },
    ],
  },
  "/pdf/header-footer": {
    heading: "Add reusable headers or footers to PDF pages",
    intro:
      "Header & Footer adds running text in a consistent page position across a selected range. Configure the content, placement, and page scope before exporting.",
    detail:
      "Use it for document names, dates, reference labels, confidentiality notices, or other repeated text. Because the content is overlaid on the page, documents with tight margins should be reviewed before download.",
    capabilities: [
      "Add running header or footer text",
      "Choose placement and supported page range",
      "Preview the result before final download",
    ],
    faqs: [
      {
        question: "Can I apply a header to only some pages?",
        answer:
          "Yes. Choose the supported page range before applying the header or footer.",
      },
      {
        question: "Will existing page content move automatically?",
        answer:
          "No. The header or footer is added over the page, so review documents with content close to the margins.",
      },
    ],
  },
  "/pdf/word-to-pdf": {
    heading: "Convert Word documents to PDF locally",
    intro:
      "Word to PDF converts supported Word documents into PDF in the browser. It is designed to preserve text, layout, tables, images, and pagination as closely as the local conversion engine allows.",
    detail:
      "Complex Word documents can still render differently from Microsoft Word, so review the generated PDF before relying on it for a final submission or print workflow.",
    capabilities: [
      "Convert supported DOCX or DOC documents",
      "Keep conversion local for supported files",
      "Review the PDF before downloading it",
    ],
    faqs: [
      {
        question: "Is my Word document uploaded?",
        answer:
          "No. Supported Word to PDF conversion runs locally in your browser.",
      },
      {
        question: "Will complex formatting always be identical?",
        answer:
          "Not always. Complex layouts, fonts, or advanced Word features can produce small rendering differences.",
      },
    ],
  },
  "/pdf/pdf-to-word": {
    heading: "Convert PDF pages into an editable Word document",
    intro:
      "PDF to Word reconstructs PDF content into a DOCX file so text and layout can be edited in a word processor. The quality of reconstruction depends on the structure of the source PDF.",
    detail:
      "Digitally generated PDFs usually provide more recoverable text and structure than scans or heavily designed documents. Complex pages may require layout-preserving fallbacks.",
    capabilities: [
      "Reconstruct editable text where reliable",
      "Preserve page layout as closely as possible",
      "Run supported conversion locally in the browser",
    ],
    faqs: [
      {
        question: "Will every PDF convert into perfect Word formatting?",
        answer:
          "No. PDFs do not store the same document structure as Word, so complex layouts must be reconstructed.",
      },
      {
        question: "Are PDFs uploaded for conversion?",
        answer:
          "No. Supported PDF to Word conversion runs locally in the browser.",
      },
    ],
  },
  "/pdf/html-to-pdf": {
    heading: "Render HTML and CSS into a PDF",
    intro:
      "HTML to PDF turns pasted or typed HTML and CSS into a downloadable PDF. Preview the rendered content, configure page options, and generate the document directly in the browser.",
    detail:
      "The renderer supports common HTML and CSS but cannot guarantee every browser layout or forced page-break rule will translate exactly into PDF pagination.",
    capabilities: [
      "Convert HTML fragments or full documents",
      "Apply CSS and preview the rendered result",
      "Choose supported page size, orientation, and margins",
    ],
    faqs: [
      {
        question: "Is pasted HTML sent to a server?",
        answer:
          "No. Supported HTML to PDF rendering takes place in your browser.",
      },
      {
        question: "Are CSS page-break rules guaranteed?",
        answer:
          "No. Page options are supported, but forced CSS page-break behavior can vary with the current renderer.",
      },
    ],
  },
};

export function ToolSeoContent({ route }: { route: keyof typeof TOOL_SEO | string }) {
  const content = TOOL_SEO[route];
  if (!content) return null;

  const headingId = `tool-seo-${route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}`;

  return (
    <section
      aria-labelledby={headingId}
      className="mx-auto mt-10 max-w-[980px] rounded-[var(--radius-2xl)] border border-[var(--border-hairline)] bg-[var(--surface-raised)] p-5 shadow-[var(--v2-elevation-1)] sm:mt-12 sm:p-6"
    >
      <h2
        id={headingId}
        className="font-serif text-xl font-semibold text-[var(--text-primary)] sm:text-2xl"
      >
        {content.heading}
      </h2>
      <div className="mt-3 grid gap-3 text-sm leading-6 text-[var(--text-secondary)]">
        <p>{content.intro}</p>
        <p>{content.detail}</p>
      </div>

      <h3 className="mt-5 text-sm font-extrabold text-[var(--text-primary)]">
        What you can do
      </h3>
      <ul className="mt-2 grid gap-2 text-sm text-[var(--text-secondary)] sm:grid-cols-3">
        {content.capabilities.map((item) => (
          <li
            key={item}
            className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[rgba(var(--paper-rgb),0.025)] px-3 py-2.5"
          >
            {item}
          </li>
        ))}
      </ul>

      <div className="mt-5">
        <h3 className="text-sm font-extrabold text-[var(--text-primary)]">
          Common questions
        </h3>
        <div className="mt-2 grid gap-2">
          {content.faqs.map((faq) => (
            <details
              key={faq.question}
              className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[rgba(var(--paper-rgb),0.025)] px-3 py-2.5"
            >
              <summary className="lumeo-focus-ring cursor-pointer rounded-[var(--radius-sm)] text-sm font-bold text-[var(--text-primary)]">
                {faq.question}
              </summary>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                {faq.answer}
              </p>
            </details>
          ))}
        </div>
      </div>

      <nav
        aria-label="Related PDF help"
        className="mt-5 flex flex-wrap gap-x-4 gap-y-2 border-t border-[var(--border-hairline)] pt-4 text-sm"
      >
        <Link className="font-bold text-[var(--text-accent)] hover:underline" href="/pdf-tools">
          All PDF tools
        </Link>
        <Link className="font-bold text-[var(--text-accent)] hover:underline" href="/guides">
          PDF guides
        </Link>
        <Link className="font-bold text-[var(--text-accent)] hover:underline" href="/pdf">
          PDF Workspace
        </Link>
      </nav>
    </section>
  );
}
