import type { ReactNode } from "react";
import { ResumeRecovery } from "@/components/ResumeRecovery";
import { WorkspaceSessionProvider } from "@/components/pdf/workspace/WorkspaceSessionProvider";

export default function PdfToolsLayout({ children }: { children: ReactNode }) {
  return (
    <WorkspaceSessionProvider>
      <ResumeRecovery />
      {children}
    </WorkspaceSessionProvider>
  );
}
