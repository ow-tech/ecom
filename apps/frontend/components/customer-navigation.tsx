"use client";

import { usePathname } from "next/navigation";
import { StorefrontHeader } from "./storefront-header";

// One persistent header, owned by the app shell rather than individual pages.
// Staff and platform workspaces have their own permission-scoped navigation.
export function CustomerNavigation() {
  const pathname = usePathname();
  if (pathname === "/platform" || pathname.startsWith("/platform/")
    || pathname === "/supplier" || pathname.startsWith("/supplier/")
    || pathname === "/staff" || pathname.startsWith("/staff/")) return null;
  return <StorefrontHeader />;
}
