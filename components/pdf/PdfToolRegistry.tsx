export type PdfToolStatus = "live" | "coming-next" | "planned";

export type PdfToolSlug =
  | "merge"
  | "split"
  | "compress"
  | "jpg-to-pdf"
  | "pdf-to-jpg"
  | "sign"
  | "word-to-pdf"
  | "organize"
  | "html-to-pdf"
  | "extract-text";

export type PdfToolDefinition = {
  slug: PdfToolSlug;
  title: string;
  shortTitle: string;
  description: string;
  route: string;
  status: PdfToolStatus;
  browserNote: string;
  engineNote: string;
  accepted: string;
  bullets: string[];
};

export const pdfTools: PdfToolDefinition[] = [
  {
    slug: "merge",
    title: "Merge PDF",
    shortTitle: "Merge",
    description: "Combine multiple PDF files into one clean document.",
    route: "/pdf/merge",
    status: "live",
    browserNote: "Browser-first merge",
    engineNote: "Live now",
    accepted: "PDF files",
    bullets: [
      "Arrange PDFs in order",
      "Smart A4 output styles",
      "Local download cleanup",
    ],
  },
  {
    slug: "split",
    title: "Split PDF",
    shortTitle: "Split",
    description: "Extract selected pages or separate one PDF into smaller files.",
    route: "/pdf/split",
    status: "live",
    browserNote: "Browser-first split",
    engineNote: "Live now",
    accepted: "one PDF file",
    bullets: [
      "Extract selected pages",
      "Split by page ranges",
      "Split every page",
      "Output naming",
      "Cleanup after download",
    ],
  },
  {
    slug: "compress",
    title: "Compress PDF",
    shortTitle: "Compress",
    description: "Reduce PDF file size for sharing and uploads.",
    route: "/pdf/compress",
    status: "live",
    browserNote: "Browser-first compression",
    engineNote: "Live now",
    accepted: "one PDF file",
    bullets: [
      "Profile-based compression",
      "Local document analysis",
      "Quality control",
      "Actual output validation",
    ],
  },
  {
    slug: "jpg-to-pdf",
    title: "JPG to PDF",
    shortTitle: "JPG to PDF",
    description: "Convert images into a clean PDF document.",
    route: "/pdf/jpg-to-pdf",
    status: "live",
    browserNote: "Browser-first generation",
    engineNote: "Live now",
    accepted: "JPG and image files",
    bullets: [
      "Add multiple images",
      "Reorder images",
      "A4 or original size",
      "Portrait or landscape",
      "Margins and quality",
      "Output filename",
    ],
  },
  {
    slug: "pdf-to-jpg",
    title: "PDF to JPG",
    shortTitle: "PDF to JPG",
    description: "Export PDF pages as image files.",
    route: "/pdf/pdf-to-jpg",
    status: "live",
    browserNote: "Browser-first rendering",
    engineNote: "Live now",
    accepted: "one PDF file",
    bullets: [
      "Page selection",
      "JPG output",
      "Quality control",
      "DPI presets",
      "ZIP download for multiple pages",
    ],
  },
  {
    slug: "sign",
    title: "Sign PDF",
    shortTitle: "Sign",
    description: "Draw or type your signature and place it on any page.",
    route: "/pdf/sign",
    status: "live",
    browserNote: "Browser-first signing",
    engineNote: "Live now",
    accepted: "one PDF file",
    bullets: [
      "Draw signature",
      "Type signature",
      "Drag to position",
      "Resize signature",
      "Any page",
    ],
  },
  {
    slug: "word-to-pdf",
    title: "Word to PDF",
    shortTitle: "Word to PDF",
    description: "Convert Word documents to PDF using free, self-hosted LibreOffice.",
    route: "/pdf/word-to-pdf",
    status: "live",
    browserNote: "Server-side conversion",
    engineNote: "Live now",
    accepted: "DOCX and DOC files",
    bullets: [
      "Preserves layout and fonts",
      "Handles tables and images",
      "Private, uploaded temporarily",
      "Cleared immediately after conversion",
    ],
  },
  {
    slug: "organize",
    title: "Organize PDF",
    shortTitle: "Organize",
    description: "Reorder, rotate, duplicate, or remove pages in one document.",
    route: "/pdf/organize",
    status: "live",
    browserNote: "Browser-first organizing",
    engineNote: "Live now",
    accepted: "one PDF file",
    bullets: [
      "Drag to reorder pages",
      "Rotate 90/180/270 degrees",
      "Duplicate or delete pages",
      "Bulk select and act on many pages",
      "Local download cleanup",
    ],
  },
  {
    slug: "html-to-pdf",
    title: "HTML to PDF",
    shortTitle: "HTML to PDF",
    description: "Turn HTML and CSS into a downloadable PDF.",
    route: "/pdf/html-to-pdf",
    status: "live",
    browserNote: "Browser-first generation",
    engineNote: "Live now",
    accepted: "HTML/CSS you type or paste",
    bullets: [
      "Live preview as you type",
      "Page size and orientation control",
      "Margin presets",
      "Starter templates",
    ],
  },
  {
    slug: "extract-text",
    title: "PDF Text Extract",
    shortTitle: "PDF Text Extract",
    description: "Pull selectable text out of a PDF and read or export it.",
    route: "/pdf/extract-text",
    status: "live",
    browserNote: "Browser-first extraction",
    engineNote: "Live now",
    accepted: "one PDF file",
    bullets: [
      "Per-page text panels",
      "Search across all pages",
      "Selective page-range extraction",
      "Export as TXT, JSON, or CSV",
      "Copy per page or copy all",
    ],
  },
];

export function getPdfTool(slug: PdfToolSlug) {
  const tool = pdfTools.find((item) => item.slug === slug);

  if (!tool) {
    throw new Error(`Unknown PDF tool: ${slug}`);
  }

  return tool;
}

export function getStatusLabel(status: PdfToolStatus) {
  if (status === "live") return "Live";
  if (status === "coming-next") return "Coming next";
  return "Planned";
}
