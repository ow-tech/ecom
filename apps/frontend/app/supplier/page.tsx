"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "../../components/session-provider";
import { loginHref, WORKFORCE_ACCESS_UNAVAILABLE } from "../../lib/auth-routing";
import { Skeleton } from "../../components/ui";

export default function SupplierEntryPage() {
  const { session, loading } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    if (!session) { router.replace(loginHref("/supplier")); return; }
    const organization = session.organizations.find(item => item.permissions.length > 0);
    if (organization) router.replace(`/supplier/${encodeURIComponent(organization.id)}`);
    else if (session.platformPermissions.length > 0) router.replace("/platform");
    else router.replace(WORKFORCE_ACCESS_UNAVAILABLE);
  }, [loading, router, session]);
  return <main className="p-8"><Skeleton className="h-8 w-48" /><Skeleton className="mt-8 h-64 w-full" /></main>;
}
