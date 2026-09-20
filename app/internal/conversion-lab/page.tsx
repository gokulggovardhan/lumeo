import { notFound } from "next/navigation";

import BrowserConversionLab from "@/components/internal/BrowserConversionLab";

export default function BrowserConversionLabPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return <BrowserConversionLab />;
}
