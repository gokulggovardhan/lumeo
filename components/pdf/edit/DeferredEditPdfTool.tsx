"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";


function ToolWorkspaceLoading() {
  return (
    <section
      aria-hidden="true"
      aria-label="Loading tool"
      className="l2-tool-workspace mx-auto grid w-full max-w-[1240px] grid-cols-1 gap-5"
    >
      <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.9fr)_minmax(330px,1fr)] xl:gap-7">
        <div aria-hidden="true" className="aura-shimmer min-h-[22rem] rounded-[var(--radius-2xl)] bg-[rgba(var(--lumeo-paper-rgb),0.07)]" />
        <div aria-hidden="true" className="aura-shimmer min-h-[22rem] rounded-[var(--radius-2xl)] bg-[rgba(var(--lumeo-paper-rgb),0.07)]" />
      </div>
    </section>
  );
}

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

  return ready ? <EditPdfTool /> : <ToolWorkspaceLoading />;
}
