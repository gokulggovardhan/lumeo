import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { PublicCatalogPageShell } from "@/components/public/PublicCatalogPageShell";
import { L2ToolPageHeader, ToolWorkspaceLoading } from "@/components/pdf/workspace/ToolWorkspace";
import { getToolBlockedState } from "@/lib/tools/tool-status";
import { ToolMaintenanceNotice } from "@/components/pdf/ToolMaintenanceNotice";

const HeicToJpegTool = dynamic(() => import("@/components/heic/HeicToJpegTool"), { loading: () => <ToolWorkspaceLoading /> });
export const metadata: Metadata = {
  title: "HEIC to JPEG - Smart iPhone Photo Conversion | Lumeo",
  description: "Convert iPhone HEIC photos to high-quality JPEG directly in your browser. Batch conversion with companion-file inspection and no photo uploads.",
  alternates: { canonical: "/heic-to-jpeg" },
  openGraph: { title: "HEIC to JPEG | Lumeo", description: "Smart iPhone photo conversion, processed locally in your browser.", url: "https://lumeo.in/heic-to-jpeg" },
};
export default async function HeicToJpegPage() {
  const state = await getToolBlockedState("heic-to-jpeg");
  return <PublicCatalogPageShell maxWidth="max-w-[1240px]">
    <L2ToolPageHeader categoryLabel="SMART IPHONE PHOTO CONVERSION" title="HEIC to JPEG" description="Convert iPhone HEIC photos to high-quality JPEG directly in your browser." />
    {state.blocked ? <ToolMaintenanceNotice status={state.status} message={state.message} /> : <HeicToJpegTool />}
  </PublicCatalogPageShell>;
}
