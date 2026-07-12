export function AdminSignOutButton() {
  return (
    <form action="/admin/logout" method="post">
      <button
        type="submit"
        className="inline-flex h-10 items-center justify-center rounded-full border border-[#E8DFC8]/12 px-4 text-sm font-semibold text-[#F0EAD6]/72 transition hover:border-[#CBA052]/35 hover:bg-[#CBA052]/10 hover:text-[#F0EAD6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CBA052]/45"
      >
        Sign out
      </button>
    </form>
  );
}
