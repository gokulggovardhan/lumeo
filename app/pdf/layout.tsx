import type { ReactNode } from "react";
import { ResumeRecovery } from "@/components/ResumeRecovery";

export default function PdfToolsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ResumeRecovery />
      {children}
    </>
  );
}
