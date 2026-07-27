// lib/tools/catalog.ts
//
// Source of truth for the dual-named Lumeo tool model: a small set of deep
// tools, each bundling many actions. The Lumeo name leads in the UI; the plain
// function + literal route/slug sit beneath it for search and SEO.
//
// `processing` is the performance contract, not decoration: "browser" tools are
// light enough to run smooth on a phone; anything heavier is "server" or
// "hybrid" by design so nothing is forced onto the wrong path and lags.
//
// `route` on an action is set only where a real, working page exists today. New
// actions ship by flipping `live` and adding a route -- no discovery-page code
// changes needed.

export type ToolProcessing = "browser" | "server" | "hybrid";
export type ToolAvailability = "available" | "soon";
export type ToolGlyphName =
  | "compose"
  | "distill"
  | "capture"
  | "render"
  | "inscribe"
  | "seal"
  | "secure"
  | "convert"
  | "recognize";

export type ToolAction = {
  label: string;
  slug: string;
  route?: string;
  live: boolean;
  // Populated by resolveLumeoTools() when the admin-controlled DB row says
  // this action isn't live right now -- undefined in the static catalog.
  dbStatus?: string;
  maintenanceMessage?: string | null;
};

export type LumeoTool = {
  key: ToolGlyphName;
  name: string;
  plain: string;
  tag: string;
  processing: ToolProcessing;
  availability: ToolAvailability;
  primaryRoute?: string;
  actions: ToolAction[];
};

export const PROCESSING_LABEL: Record<ToolProcessing, string> = {
  browser: "Runs in your browser",
  server: "Runs on a private server",
  hybrid: "Local when it can, server when it must",
};

export const lumeoTools: LumeoTool[] = [
  {
    key: "compose",
    name: "Compose",
    plain: "Organize PDF",
    tag: "Assemble, reorder and reshape a document in one place.",
    processing: "browser",
    availability: "available",
    primaryRoute: "/pdf/merge",
    actions: [
      { label: "Merge", slug: "merge", route: "/pdf/merge", live: true },
      { label: "Split", slug: "split", route: "/pdf/split", live: true },
      { label: "Split by range", slug: "split-range", route: "/pdf/split", live: true },
      { label: "Page Re-Order", slug: "reorder", route: "/pdf/organize", live: true },
      { label: "Rotate pages", slug: "rotate", route: "/pdf/organize", live: true },
      { label: "Remove pages", slug: "remove-pages", route: "/pdf/organize", live: true },
      { label: "Extract pages", slug: "extract-pages", route: "/pdf/split", live: true },
      { label: "Duplicate page", slug: "duplicate-page", route: "/pdf/organize", live: true },
    ],
  },
  {
    key: "distill",
    name: "Distill",
    plain: "Compress & optimize",
    tag: "Bring the size down and tidy the file up.",
    processing: "browser",
    availability: "available",
    primaryRoute: "/pdf/compress",
    actions: [
      { label: "Compress", slug: "compress", route: "/pdf/compress", live: true },
      { label: "Deep compress", slug: "deep-compress", route: "/pdf/compress", live: true },
      { label: "Grayscale", slug: "grayscale", route: "/pdf/compress", live: true },
      { label: "Flatten", slug: "flatten", route: "/pdf/compress", live: true },
      { label: "Repair", slug: "repair", live: false },
      { label: "PDF/A", slug: "pdf-a", live: false },
    ],
  },
  {
    key: "capture",
    name: "Capture",
    plain: "Images to PDF",
    tag: "Turn photos and scans into a clean PDF.",
    // Verified browser-only today (its one live action, JPG to PDF, has zero
    // network calls). Revisit to "hybrid" only once a genuinely
    // server-backed action (e.g. HEIC decode) actually ships live.
    processing: "browser",
    availability: "available",
    primaryRoute: "/pdf/jpg-to-pdf",
    actions: [
      { label: "JPG to PDF", slug: "jpg-to-pdf", route: "/pdf/jpg-to-pdf", live: true },
      { label: "PNG to PDF", slug: "png-to-pdf", route: "/pdf/jpg-to-pdf", live: true },
      { label: "WEBP to PDF", slug: "webp-to-pdf", route: "/pdf/jpg-to-pdf", live: true },
      { label: "HEIC to PDF", slug: "heic-to-pdf", live: false },
    ],
  },
  {
    key: "render",
    name: "Render",
    plain: "PDF to images & text",
    tag: "Export pages as images, or pull the content out.",
    // Verified browser-only today (its one live action, PDF to JPG, has zero
    // network calls). Revisit to "hybrid" only once a genuinely
    // server-backed action actually ships live.
    processing: "browser",
    availability: "available",
    primaryRoute: "/pdf/pdf-to-jpg",
    actions: [
      { label: "PDF to JPG", slug: "pdf-to-jpg", route: "/pdf/pdf-to-jpg", live: true },
      { label: "PDF to PNG", slug: "pdf-to-png", route: "/pdf/pdf-to-jpg", live: true },
      { label: "PDF to WEBP", slug: "pdf-to-webp", route: "/pdf/pdf-to-jpg", live: true },
      { label: "Text Extract", slug: "extract-text", route: "/pdf/extract-text", live: true },
      { label: "PDF to HTML", slug: "pdf-to-html", live: false },
    ],
  },
  {
    key: "inscribe",
    name: "Inscribe",
    plain: "Edit & annotate",
    tag: "Type, highlight, stamp and mark up any page.",
    processing: "browser",
    availability: "available",
    primaryRoute: "/pdf/edit",
    actions: [
      { label: "Edit PDF", slug: "edit", route: "/pdf/edit", live: true },
      { label: "Images", slug: "add-images", live: false },
      { label: "Watermark", slug: "watermark", live: false },
      { label: "Page numbers", slug: "page-numbers", live: false },
      { label: "Header & footer", slug: "header-footer", live: false },
      { label: "Crop", slug: "crop", live: false },
      { label: "Bookmarks", slug: "bookmarks", live: false },
    ],
  },
  {
    key: "seal",
    name: "Seal",
    plain: "Sign & fill",
    tag: "Complete forms and sign — privately, in the browser.",
    processing: "browser",
    availability: "available",
    primaryRoute: "/pdf/sign",
    actions: [
      { label: "Sign PDF", slug: "sign", route: "/pdf/sign", live: true },
      { label: "Fill forms", slug: "fill-forms", live: false },
      { label: "Initials & date", slug: "initials-date", route: "/pdf/sign", live: true },
    ],
  },
  {
    key: "secure",
    name: "Secure",
    plain: "Protect PDF",
    tag: "Lock, unlock, redact and scrub hidden data.",
    processing: "browser",
    availability: "soon",
    actions: [
      { label: "Password & permissions", slug: "password", live: false },
      { label: "Unlock", slug: "unlock", live: false },
      { label: "Redact", slug: "redact", live: false },
      { label: "Remove metadata", slug: "remove-metadata", live: false },
      { label: "Compare", slug: "compare", live: false },
    ],
  },
  {
    key: "convert",
    name: "Convert",
    plain: "Office ↔ PDF",
    tag: "Word, Excel, PowerPoint and more — via free, self-hosted LibreOffice.",
    processing: "server",
    availability: "available",
    primaryRoute: "/pdf/word-to-pdf",
    actions: [
      { label: "Word to PDF", slug: "word-to-pdf", route: "/pdf/word-to-pdf", live: true },
      { label: "Excel to PDF", slug: "excel-to-pdf", live: false },
      { label: "PowerPoint to PDF", slug: "powerpoint-to-pdf", live: false },
      { label: "PDF to Word", slug: "pdf-to-word", route: "/pdf/pdf-to-word", live: true },
      { label: "HTML to PDF", slug: "html-to-pdf", route: "/pdf/html-to-pdf", live: true },
    ],
  },
  {
    key: "recognize",
    name: "Recognize",
    plain: "OCR — searchable scans",
    tag: "Make scanned PDFs searchable and selectable — via free Tesseract.",
    processing: "server",
    availability: "soon",
    actions: [
      { label: "Searchable PDF", slug: "searchable-pdf", live: false },
      { label: "Read scan text", slug: "read-scan-text", live: false },
      { label: "Multi-language", slug: "multi-language", live: false },
      { label: "Deskew", slug: "deskew", live: false },
    ],
  },
];

export const availableTools = lumeoTools.filter((tool) => tool.availability === "available");
export const comingSoonTools = lumeoTools.filter((tool) => tool.availability === "soon");
