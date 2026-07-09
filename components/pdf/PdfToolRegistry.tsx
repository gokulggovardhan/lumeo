export type PdfToolStatus = "live" | "coming-next" | "planned";

export type PdfToolSlug =
  | "merge"
  | "split"
  | "compress"
  | "jpg-to-pdf"
  | "pdf-to-jpg";

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
    status: "planned",
    browserNote: "Browser-first where possible",
    engineNote: "Compression engine coming later.",
    accepted: "one PDF file",
    bullets: [
      "Smart compression",
      "Image-heavy PDF optimization where possible",
      "Quality control",
      "Estimated output size when supported",
    ],
  },
  {
    slug: "jpg-to-pdf",
    title: "JPG to PDF",
    shortTitle: "JPG to PDF",
    description: "Convert images into a clean PDF document.",
    route: "/pdf/jpg-to-pdf",
    status: "planned",
    browserNote: "Browser-first generation planned",
    engineNote: "Tool engine coming later.",
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
    status: "planned",
    browserNote: "Browser-first rendering where possible",
    engineNote: "Tool engine coming later.",
    accepted: "one PDF file",
    bullets: [
      "Page selection",
      "JPG or PNG output",
      "Quality control",
      "Scale options",
      "Download package",
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
