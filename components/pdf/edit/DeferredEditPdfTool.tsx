"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { EditPdfEmptyState } from "@/components/pdf/edit/EditPdfEmptyState";

const EditPdfTool = dynamic(() => import("@/components/pdf/EditPdfTool"), {
  ssr: false,
  loading: () => <EditPdfEmptyState preparing />,
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
    return <EditPdfEmptyState preparing />;
  }

  return <EditPdfTool />;
}
