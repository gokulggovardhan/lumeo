"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { ToolWorkspaceLoading } from "@/components/pdf/workspace/ToolWorkspace";

const EditPdfTool = dynamic(() => import("@/components/pdf/EditPdfTool"), {
  ssr: false,
  loading: () => <ToolWorkspaceLoading />,
});

export default function DeferredEditPdfTool() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        setReady(true);
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, []);

  if (!ready) {
    return <ToolWorkspaceLoading />;
  }

  return <EditPdfTool />;
}
