import type { ReactNode } from "react";
import { ResumeRecovery } from "@/components/ResumeRecovery";
import { WorkspaceDocumentProvider } from "@/components/pdf/workspace/WorkspaceDocumentProvider";
import { WorkspaceHistoryControls } from "@/components/pdf/workspace/WorkspaceHistoryControls";

export default function PdfToolsLayout({ children }: { children: ReactNode }) {
  return (
    <WorkspaceDocumentProvider>
      <ResumeRecovery />
      <WorkspaceHistoryControls />
      {children}
    </WorkspaceDocumentProvider>
  );
}
