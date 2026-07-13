export default function PdfToolsLoading() {
  return (
    <main className="min-h-dvh bg-[#0C1220] px-5 py-8 text-[#F0EAD6] sm:px-8">
      <div className="mx-auto max-w-[1160px]">
        <div className="h-6 w-36 rounded-full bg-[#F0EAD6]/10" />
        <div className="mt-5 h-12 w-full max-w-xl rounded-2xl bg-[#F0EAD6]/10" />
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <div key={item} className="h-40 rounded-[22px] border border-[#E8DFC8]/8 bg-[#111A2B]" />
          ))}
        </div>
      </div>
    </main>
  );
}
