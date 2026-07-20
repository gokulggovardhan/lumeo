import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { PublicCatalogPageShell } from "@/components/public/PublicCatalogPageShell";
import { L2ToolPageHeader, ToolWorkspaceLoading } from "@/components/pdf/workspace/ToolWorkspace";
import { withSeoOverride } from "@/lib/public-site/seo";

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
    },
    twitter: {
      card: "summary_large_image",
      title: "Sign PDF Online Privately | Lumeo PDF",
      description: "Draw or type a signature and place it on any page, directly in your browser.",
    },
  });
}

export default function SignPdfPage() {
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

      <div className="l2-live-tool-workspace lumeo-fade-up lumeo-fade-up-delay-1 aura-live-tool aura-sign-tool"><SignPdfTool /></div>
    </PublicCatalogPageShell>
  );
}
