import { pdfTools } from "@/components/pdf/PdfToolRegistry";
import type {
  PublicCatalogResult,
  PublicHomepageTool,
  PublicPdfTool,
  PublicToolCategory,
  PublicToolStatus,
} from "@/lib/public-catalog/types";

function toPublicStatus(status: string): PublicToolStatus {
  return status === "live" ? "active" : "coming_soon";
}

const categoryMap: Record<string, Omit<PublicToolCategory, "tools">> = {
  "organize-pdf": {
    slug: "organize-pdf",
    name: "Organize PDF",
    description: "Arrange, merge, split, and prepare document structure.",
    sortOrder: 10,
  },
  "optimize-pdf": {
    slug: "optimize-pdf",
    name: "Optimize PDF",
    description: "Reduce weight and prepare files for sharing.",
    sortOrder: 20,
  },
  "convert-to-pdf": {
    slug: "convert-to-pdf",
    name: "Convert to PDF",
    description: "Turn source files into polished PDFs.",
    sortOrder: 30,
  },
  "convert-from-pdf": {
    slug: "convert-from-pdf",
    name: "Convert from PDF",
    description: "Export PDF pages into practical formats.",
    sortOrder: 40,
  },
  "edit-pdf": {
    slug: "edit-pdf",
    name: "Edit & Sign",
    description: "Edit, sign, and add page details to PDF documents.",
    sortOrder: 50,
  },
};

const toolCategory: Record<string, string> = {
  merge: "organize-pdf",
  split: "organize-pdf",
  reorder: "organize-pdf",
  compress: "optimize-pdf",
  "jpg-to-pdf": "convert-to-pdf",
  "word-to-pdf": "convert-to-pdf",
  "html-to-pdf": "convert-to-pdf",
  "heic-to-jpeg": "convert-to-pdf",
  "pdf-to-jpg": "convert-from-pdf",
  "pdf-to-word": "convert-from-pdf",
  "extract-text": "convert-from-pdf",
  sign: "edit-pdf",
  edit: "edit-pdf",
  watermark: "edit-pdf",
  crop: "edit-pdf",
  "page-numbers": "edit-pdf",
  "header-footer": "edit-pdf",
};

const fallbackOrder = ["merge", "split", "compress", "jpg-to-pdf", "pdf-to-jpg"];

const supplementalFallbackTools = [
  {
    slug: "crop",
    title: "Crop PDF",
    description: "Crop PDF pages to a custom rectangle.",
    route: "/pdf/crop",
  },
  {
    slug: "page-numbers",
    title: "Page Numbers",
    description: "Add page numbers to a PDF.",
    route: "/pdf/page-numbers",
  },
  {
    slug: "header-footer",
    title: "Header & Footer",
    description: "Add a header and footer to a PDF.",
    route: "/pdf/header-footer",
  },
  {
    slug: "heic-to-jpeg",
    title: "HEIC to JPEG",
    description: "Convert iPhone HEIC photos to high-quality JPEG in your browser.",
    route: "/heic-to-jpeg",
  },
] as const;

export function getFallbackPublicTools(): PublicPdfTool[] {
  const localTools = pdfTools.map((tool) => ({
    slug: tool.slug === "organize" ? "reorder" : tool.slug,
    title: tool.title,
    description: tool.description,
    route: tool.route,
    status: toPublicStatus(tool.status),
  }));
  const tools = [
    ...localTools,
    ...supplementalFallbackTools.map((tool) => ({ ...tool, status: "active" as const })),
  ];

  return tools.map((tool, index) => {
    const category = categoryMap[toolCategory[tool.slug] ?? "edit-pdf"];
    return {
      toolSlug: tool.slug,
      toolName: tool.title,
      shortDescription: tool.description,
      route: tool.route,
      iconKey: tool.slug,
      status: tool.status,
      isEnabled: true,
      maintenanceMessage: null,
      categorySlug: category.slug,
      categoryName: category.name,
      categoryDescription: category.description,
      categorySortOrder: category.sortOrder,
      toolSortOrder: (index + 1) * 10,
    };
  });
}

export function groupPublicTools(tools: PublicPdfTool[]): PublicToolCategory[] {
  const groups = new Map<string, PublicToolCategory>();

  for (const tool of tools) {
    const slug = tool.categorySlug ?? "uncategorized";
    const existing = groups.get(slug);
    if (existing) {
      existing.tools.push(tool);
      continue;
    }

    groups.set(slug, {
      slug,
      name: tool.categoryName || "PDF Tools",
      description: tool.categoryDescription,
      sortOrder: tool.categorySortOrder,
      tools: [tool],
    });
  }

  for (const group of groups.values()) {
    group.tools.sort((a, b) => a.toolName.localeCompare(b.toolName));
  }

  return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function getFallbackPublicCatalog(): PublicCatalogResult {
  const tools = getFallbackPublicTools();
  return {
    tools,
    categories: groupPublicTools(tools),
    source: "fallback",
  };
}

export function getFallbackHomepageTools(): PublicHomepageTool[] {
  const tools = getFallbackPublicTools();
  return fallbackOrder.map((slug, index) => {
    const tool = tools.find((candidate) => candidate.toolSlug === slug);
    if (!tool) throw new Error(`Missing fallback homepage tool: ${slug}`);
    return {
      slotNumber: index + 1,
      toolSlug: tool.toolSlug,
      toolName: tool.toolName,
      shortDescription: tool.shortDescription,
      route: tool.route,
      iconKey: tool.iconKey,
      status: tool.status,
    };
  });
}
