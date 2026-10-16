"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "../../components/session-provider";
import { loginHref } from "../../lib/auth-routing";
import { EmptyState, Skeleton } from "../../components/ui";

export default function SupplierEntryPage() {
  const { session, loading } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    if (!session) { router.replace(loginHref("/supplier")); return; }
    if (session.organizations[0]) router.replace(`/supplier/${session.organizations[0].id}`);
  }, [loading, router, session]);
  if (loading || !session || session.organizations[0]) return <main className="p-8"><Skeleton className="h-8 w-48" /><Skeleton className="mt-8 h-64 w-full" /></main>;
  return <main className="mx-auto max-w-xl p-6"><EmptyState title="Workspace unavailable" detail="Your account does not have an active organization membership." /></main>;
}
