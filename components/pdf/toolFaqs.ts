// Single source of truth for every tool's FAQ copy -- both the public
// /guides page and each tool's own /pdf/<slug> page render from these same
// arrays, so the visible copy and the FAQPage schema on each surface can
// never drift out of sync with each other.

export type FaqItem = { question: string; answer: string };

export const mergeFaqs: FaqItem[] = [
  {
    question: "Are my PDF files uploaded to a server?",
    answer:
      "No. Lumeo Merge PDF uses browser-first processing for supported files, so your documents stay on your device during the merge workflow.",
  },
  {
    question: "Can I change the PDF order before merging?",
    answer: "Yes. You can drag and rearrange documents in the workspace before creating the merged PDF.",
  },
  {
    question: "Can Lumeo preserve the original PDF page sizes?",
    answer:
      "Yes. Merge PDF includes output options for keeping original page sizes, matching the first PDF, or using smart A4 sizing.",
  },
  {
    question: "What happens to my files after download?",
    answer:
      "Lumeo can clear the active workspace after download, and you can also manually start a new merge to remove the current files from the session.",
  },
];

export const splitFaqs: FaqItem[] = [
  {
    question: "Are my PDF files uploaded?",
    answer: "No. Supported Split PDF processing takes place directly in your browser, keeping the document on your device.",
  },
  {
    question: "Can I extract only selected pages?",
    answer: "Yes. Use Extract pages to create a new PDF containing only the pages you select.",
  },
  {
    question: "Can I remove pages from a PDF?",
    answer: "Yes. The Remove pages method creates a new PDF without the selected pages.",
  },
  {
    question: "Can I split a PDF into multiple files?",
    answer: "Yes. You can split by ranges, create one PDF per page, or create equal document chunks using Every N pages.",
  },
  {
    question: "Does Split PDF support range shortcuts?",
    answer: "Yes. Supported range inputs include values such as 1-3, 1-3,5, end, all, odd, and even.",
  },
];

export const compressFaqs: FaqItem[] = [
  {
    question: "Are my PDF files uploaded?",
    answer: "No. Supported compression processing takes place directly in your browser for this tool.",
  },
  {
    question: "Can every PDF be compressed significantly?",
    answer: "No. Results depend on the document. Text-only or already optimised PDFs may have limited savings.",
  },
  {
    question: "Will compression reduce quality?",
    answer: "Compression can reduce page rendering detail. Review the downloaded result before replacing the original.",
  },
  {
    question: "What happens if the compressed file is larger?",
    answer:
      "Lumeo compares the actual result with the original and recommends keeping the original when compression does not provide a useful reduction.",
  },
];

export const jpgToPdfFaqs: FaqItem[] = [
  {
    question: "Which image formats can I convert to PDF?",
    answer: "JPG, PNG, and WEBP images are supported, and can be mixed in the same PDF.",
  },
  {
    question: "Can I reorder images before combining them?",
    answer: "Yes. Drag images into the order you want before generating the PDF.",
  },
  {
    question: "Are my images uploaded to a server?",
    answer: "No. Images are combined into a PDF directly in your browser.",
  },
];

export const pdfToJpgFaqs: FaqItem[] = [
  {
    question: "Can I export only some pages as images?",
    answer: "Yes. Select the pages you want before exporting.",
  },
  {
    question: "What image formats can I export to?",
    answer: "JPG, PNG, and WEBP are all supported, with adjustable quality and DPI.",
  },
  {
    question: "How do I download multiple exported pages at once?",
    answer: "When more than one page is exported, Lumeo bundles them into a single ZIP download.",
  },
];

export const organizeFaqs: FaqItem[] = [
  {
    question: "What's the difference between Split and Page Re-Order?",
    answer:
      "Split produces separate files from one PDF. Page Re-Order changes the order, rotation, or count of pages inside a single PDF and gives back one file.",
  },
  {
    question: "Can I undo a reorder or delete before exporting?",
    answer: "Yes. Changes only apply to the working copy in your browser tab -- reload the page to start over before you download.",
  },
  {
    question: "Does duplicating a page keep its rotation?",
    answer: "Yes. A duplicated page carries over any rotation already applied to the original.",
  },
];

export const extractTextFaqs: FaqItem[] = [
  {
    question: "Does Text Extract work on scanned PDFs?",
    answer:
      "Only if the PDF already has selectable text. Scanned pages without an OCR layer have no extractable text -- a searchable-scan tool is planned separately.",
  },
  {
    question: "Which export formats are supported?",
    answer: "TXT, JSON, and CSV -- one page range or the full document, with per-page or copy-all options in the workspace itself.",
  },
  {
    question: "Can I extract only some pages?",
    answer: "Yes. Enter a page range (e.g. 1-3,5) and only those pages are pulled into the preview and export.",
  },
];

export const htmlToPdfFaqs: FaqItem[] = [
  {
    question: "Can I paste a full HTML document?",
    answer: "Yes. Paste a complete document or a fragment -- styles are applied either way, and the result is sanitized before rendering.",
  },
  {
    question: "Does it support CSS page breaks?",
    answer:
      "Page size, orientation, and margins are configurable, but forced CSS page-break rules are not guaranteed to be honored by the current renderer.",
  },
  {
    question: "Is my pasted HTML uploaded anywhere?",
    answer: "No. It's rendered and converted to PDF entirely in your browser.",
  },
];

export const signFaqs: FaqItem[] = [
  {
    question: "Is my signature stored anywhere?",
    answer: "No. Signatures are drawn or typed in your browser and applied directly to the downloaded file.",
  },
  {
    question: "Can I resize or reposition a signature after placing it?",
    answer: "Yes, before you finish -- drag to reposition and use the resize handles to scale it on the page.",
  },
];

export const wordToPdfFaqs: FaqItem[] = [
  {
    question: "Is Word to PDF conversion private?",
    answer:
      "Office format conversion needs a server-side engine (free, self-hosted LibreOffice), so the file is uploaded temporarily and cleared immediately after conversion -- it is not stored.",
  },
  {
    question: "Does it preserve formatting?",
    answer: "Layout, fonts, tables, and images are preserved for standard DOCX/DOC documents. Highly complex layouts may shift slightly.",
  },
];

export const pdfToWordFaqs: FaqItem[] = [
  {
    question: "Is PDF to Word conversion private?",
    answer:
      "Conversion needs a server-side engine (free, self-hosted LibreOffice), so the file is uploaded temporarily and cleared immediately after conversion -- it is not stored.",
  },
  {
    question: "Will my PDF's layout and tables convert cleanly?",
    answer: "Standard text layouts, tables, and images convert well. Complex multi-column layouts or scanned pages may need manual cleanup.",
  },
];

export const privacyFaqs: FaqItem[] = [
  {
    question: "What does browser-first mean?",
    answer: "Browser-first means supported PDF work happens on your device in the browser instead of requiring a server upload.",
  },
  {
    question: "Do I need an account for PDF tools?",
    answer: "No. The public PDF workspaces are designed for simple document tasks without unnecessary sign-in.",
  },
];
