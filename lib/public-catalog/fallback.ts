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
};

const toolCategory: Record<string, string> = {
  merge: "organize-pdf",
  split: "organize-pdf",
  compress: "optimize-pdf",
  "jpg-to-pdf": "convert-to-pdf",
  "pdf-to-jpg": "convert-from-pdf",
};

const fallbackOrder = ["merge", "split", "compress", "jpg-to-pdf", "pdf-to-jpg"];

export function getFallbackPublicTools(): PublicPdfTool[] {
  return fallbackOrder.flatMap((slug, index) => {
    const local = pdfTools.find((tool) => tool.slug === slug);
    if (!local) return [];
    const category = categoryMap[toolCategory[slug] ?? "organize-pdf"];
    return [
      {
        toolSlug: local.slug,
        toolName: local.title,
        shortDescription: local.description,
        route: local.route,
        iconKey: local.slug,
        status: toPublicStatus(local.status),
        categorySlug: category.slug,
        categoryName: category.name,
        categoryDescription: category.description,
        categorySortOrder: category.sortOrder,
        toolSortOrder: (index + 1) * 10,
      },
    ];
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

  return Array.from(groups.values()).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
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
  return getFallbackPublicTools().slice(0, 5).map((tool, index) => ({
    slotNumber: index + 1,
    toolSlug: tool.toolSlug,
    toolName: tool.toolName,
    shortDescription: tool.shortDescription,
    route: tool.route,
    iconKey: tool.iconKey,
    status: tool.status,
  }));
}
