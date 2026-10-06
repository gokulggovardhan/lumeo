"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { WorkspaceStartFirstPaint } from "@/components/pdf/workspace/WorkspaceStartFirstPaint";

const WorkspaceStart = dynamic(
  () =>
    import("@/components/pdf/workspace/WorkspaceStart").then(
      (module) => module.WorkspaceStart,
    ),
  {
    ssr: false,
    loading: () => <WorkspaceStartFirstPaint />,
  },
);

export default function DeferredWorkspaceStart() {
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
    return <WorkspaceStartFirstPaint />;
  }

  return <WorkspaceStart />;
}
