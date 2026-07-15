// components/pdf/PdfToolLauncher.tsx

import { getPublicHomepageTools } from "@/lib/public-catalog/data";
import type { PublicHomepageTool } from "@/lib/public-catalog/types";
import { L2FeaturedToolCard, L2ToolCard } from "@/components/ui/Aura";

function ToolCard({
  tool,
  index,
  featured = false,
  allTools = false,
}: {
  tool: PublicHomepageTool | { toolName: string; shortDescription: string; route: string; iconKey: string };
  index: number;
  featured?: boolean;
  allTools?: boolean;
}) {
  return (
    <li className="lumeo-fade-up min-w-0" style={{ animationDelay: `${index * 80}ms` }}>
      {featured ? <L2FeaturedToolCard tool={tool} /> : <L2ToolCard tool={tool} allTools={allTools} />}
    </li>
  );
}

export async function PdfToolLauncher({ showHeading = true }: { showHeading?: boolean }) {
  const configuredTools = await getPublicHomepageTools();
  const tools = configuredTools.slice(0, 5);
  const allToolsCard = {
    toolName: "All PDF Tools",
    shortDescription: "Browse every available PDF tool by category.",
    route: "/pdf-tools",
    iconKey: "all",
  };

  return (
    <section aria-label="PDF tools">
      {showHeading ? (
        <header className="mb-7 text-center">
          <p className="aura-text-label text-[var(--lumeo-gold-300)]">
            Lumeo PDF Workspace
          </p>
          <h1 className="mt-3 font-serif text-[var(--text-heading-xl)] leading-[var(--leading-heading)] text-[var(--lumeo-paper-50)]">
            Choose a tool. Get it done.
          </h1>
        </header>
      ) : null}

      <nav aria-label="Available PDF tools">
        <ul className="l2-home-tool-grid grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...tools, allToolsCard].map((tool, index) => (
            <ToolCard key={`${tool.route}-${index}`} tool={tool} index={index} featured={index === 0} allTools={index === 5} />
          ))}
        </ul>
      </nav>
    </section>
  );
}
