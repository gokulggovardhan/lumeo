export function AdminEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[1.2rem] border border-dashed border-[#E8DFC8]/16 bg-[#0C1220]/46 p-6 text-center">
      <p className="text-sm font-semibold text-[#F0EAD6]">{title}</p>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#F0EAD6]/54">{description}</p>
    </div>
  );
}
