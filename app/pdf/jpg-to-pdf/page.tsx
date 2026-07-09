import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "JPG to PDF Online - Lumeo PDF Workspace",
  description:
    "Turn photos, scans, and images into a clean PDF document with Lumeo PDF Workspace.",
  alternates: {
    canonical: "/pdf/jpg-to-pdf",
  },
};

export default function JpgToPdfPage() {
  return (
    <ToolPlaceholder
      title="JPG to PDF"
      description="Turn photos, scans, and images into a clean PDF document."
      accepted="JPG and image files"
    />
  );
}

function ToolPlaceholder({
  title,
  description,
  accepted,
}: {
  title: string;
  description: string;
  accepted: string;
}) {
  return (
    <main className="min-h-screen bg-[#07070A] px-5 py-8 text-[#F8F1E6] sm:px-8 lg:px-12">
      <div className="mx-auto max-w-4xl">
        <nav className="flex items-center justify-between border-b border-white/10 pb-5">
          <Link href="/" className="text-sm font-black text-white">
            Lumeo PDF Workspace
          </Link>
          <Link
            href="/"
            className="rounded-full border border-white/10 px-4 py-2 text-xs font-black text-white/60 transition hover:text-white"
          >
            Back to Lumeo PDF
          </Link>
        </nav>
        <section className="py-14">
          <p className="mb-3 text-xs font-black uppercase tracking-[0.24em] text-[#FFB07C]">
            PDF workspace
          </p>
          <h1 className="text-4xl font-black tracking-tight sm:text-6xl">{title}</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-white/54">{description}</p>
        </section>
        <section className="rounded-3xl border border-white/10 bg-[#101018] p-5 shadow-2xl shadow-black/30 sm:p-8">
          <div className="rounded-3xl border border-dashed border-[#FF7A3D]/28 bg-[#FF5A36]/[0.04] p-8 text-center sm:p-12">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#FF7A3D]/22 bg-[#FF5A36]/10 text-xl font-black text-[#FFB07C]">
              PDF
            </div>
            <h2 className="text-2xl font-black">Upload area preview</h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-white/50">
              This workspace will accept {accepted}. The processing engine is
              coming next, so no files are uploaded from this placeholder.
            </p>
            <p className="mt-6 rounded-full border border-white/10 px-4 py-2 text-xs font-black text-white/42">
              Tool engine coming next.
            </p>
          </div>
          <p className="mt-5 text-sm font-semibold leading-6 text-white/44">
            Privacy note: Most tools are designed to run in your browser where
            possible. If server processing is required later, files should be
            temporary and handled with clear deletion rules.
          </p>
        </section>
      </div>
    </main>
  );
}
