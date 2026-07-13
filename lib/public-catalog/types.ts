export type PublicToolStatus = "active" | "beta";

export type PublicPdfTool = {
  toolSlug: string;
  toolName: string;
  shortDescription: string;
  route: string;
  iconKey: string;
  status: PublicToolStatus;
  categorySlug: string | null;
  categoryName: string;
  categoryDescription: string | null;
  categorySortOrder: number;
  toolSortOrder: number;
};

export type PublicToolCategory = {
  slug: string;
  name: string;
  description: string | null;
  sortOrder: number;
  tools: PublicPdfTool[];
};

export type PublicHomepageTool = {
  slotNumber: number;
  toolSlug: string;
  toolName: string;
  shortDescription: string;
  route: string;
  iconKey: string;
  status: PublicToolStatus;
};

export type PublicCatalogResult = {
  categories: PublicToolCategory[];
  tools: PublicPdfTool[];
  source: "supabase" | "fallback";
};
