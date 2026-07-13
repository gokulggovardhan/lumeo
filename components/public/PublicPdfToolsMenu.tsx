import { getPublicPdfCatalog } from "@/lib/public-catalog/data";
import { PublicPdfToolsMenuClient } from "@/components/public/PublicPdfToolsMenuClient";

export async function PublicPdfToolsMenu({ compact = false }: { compact?: boolean }) {
  const catalog = await getPublicPdfCatalog();
  return <PublicPdfToolsMenuClient categories={catalog.categories} compact={compact} />;
}
