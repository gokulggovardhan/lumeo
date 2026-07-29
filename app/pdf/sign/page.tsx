import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { PublicCatalogPageShell } from "@/components/public/PublicCatalogPageShell";
import { L2ToolPageHeader, ToolWorkspaceLoading } from "@/components/pdf/workspace/ToolWorkspace";
import { ToolMaintenanceNotice } from "@/components/pdf/ToolMaintenanceNotice";
import { getToolBlockedState } from "@/lib/tools/tool-status";
import { withSeoOverride } from "@/lib/public-site/seo";
import { buildBreadcrumbSchema, buildSoftwareApplicationSchema } from "@/lib/public-site/schema";

const softwareSchema = buildSoftwareApplicationSchema({
  name: "Lumeo Sign PDF",
  description: "Draw or type a signature and place it on any PDF page privately in your browser.",
  path: "/pdf/sign",
  featureList: ["Draw signature", "Type signature", "Drag to position", "No file upload"],
});
const breadcrumbSchema = buildBreadcrumbSchema([
  { name: "Home", path: "/" },
  { name: "PDF Tools", path: "/pdf-tools" },
  { name: "Sign PDF", path: "/pdf/sign" },
]);

const SignPdfTool = dynamic(() => import("@/components/pdf/SignPdfTool"), {
  loading: () => <ToolWorkspaceLoading />,
});

export async function generateMetadata(): Promise<Metadata> {
  return withSeoOverride("/pdf/sign", {
    title: {
      absolute: "Sign PDF Online Privately - Draw or Type a Signature | Lumeo PDF",
    },
    description:
      "Sign a PDF privately in your browser with Lumeo PDF Workspace. Draw or type your signature, place it on any page, and download -- no upload, no account.",
    alternates: {
      canonical: "/pdf/sign",
    },
    openGraph: {
      title: "Sign PDF Online Privately | Lumeo PDF",
      description:
        "Draw or type a signature and place it on any page in a calm browser-first workspace. Files stay on your device.",
      url: "https://lumeo.in/pdf/sign",
      siteName: "Lumeo PDF",
      type: "website",
      images: ["https://lumeo.in/opengraph-image"],
    },
    twitter: {
      card: "summary_large_image",
      title: "Sign PDF Online Privately | Lumeo PDF",
      description: "Draw or type a signature and place it on any page, directly in your browser.",
      images: ["https://lumeo.in/twitter-image"],
    },
  });
}

export default async function SignPdfPage() {
  const toolState = await getToolBlockedState("sign");

  return (
    <PublicCatalogPageShell
      maxWidth="max-w-[1240px]"
      mainClassName="min-h-dvh bg-[var(--surface-canvas)] text-[var(--text-primary)]"
      contentClassName="px-5 pb-12 pt-7 sm:px-8 sm:pb-14 sm:pt-9"
    >
      <L2ToolPageHeader
        title="Sign PDF"
        description="Draw or type your signature, then place it on any page."
      />

      {toolState.blocked ? (
        <ToolMaintenanceNotice status={toolState.status} message={toolState.message} />
      ) : (
        <div className="l2-live-tool-workspace lumeo-fade-up lumeo-fade-up-delay-1 aura-live-tool aura-sign-tool"><SignPdfTool /></div>
      )}

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
    </PublicCatalogPageShell>
  );
}
