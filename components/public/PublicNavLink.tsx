"use client";

import { usePathname } from "next/navigation";
import { L2PublicNavLink } from "@/components/ui/Aura";
import type { ComponentProps } from "react";

// L2PublicNavLink already supports an `active` prop and renders a real
// current-page indicator, but nothing in PublicPdfChrome.tsx was ever
// passing it -- the active state was dead code (confirmed: PublicNav is
// an async Server Component, and this Aura OS v2 PR needed a client
// boundary to read the real pathname via next/navigation, the same
// pattern already used by components/admin/ControlCenterSidebar.tsx).
export function PublicNavLink(props: ComponentProps<typeof L2PublicNavLink>) {
  const pathname = usePathname();
  const href = typeof props.href === "string" ? props.href : props.href.pathname;
  return <L2PublicNavLink {...props} active={pathname === href} />;
}
