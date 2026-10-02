import type { ReactNode } from "react";
import { ResumeRecovery } from "@/components/ResumeRecovery";
import { WorkspaceDocumentProvider } from "@/components/pdf/workspace/WorkspaceDocumentProvider";
import { WorkspaceHistoryControls } from "@/components/pdf/workspace/WorkspaceHistoryControls";
import { WorkspaceDocumentHealth } from "@/components/pdf/workspace/WorkspaceDocumentHealth";
import { WorkspaceMobileNav } from "@/components/pdf/workspace/WorkspaceMobileNav";

export default function PdfToolsLayout({ children }: { children: ReactNode }) {
  return (
    <WorkspaceDocumentProvider>
      <ResumeRecovery />
      <WorkspaceHistoryControls />
      <WorkspaceDocumentHealth />
      {children}
      <WorkspaceMobileNav />
    </WorkspaceDocumentProvider>
  );
}
