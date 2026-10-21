"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "../../../../components/session-provider";
import { SignOutButton } from "../../../../components/sign-out-button";
import { EmptyState, Skeleton } from "../../../../components/ui";
import { workforceDestination, WORKFORCE_ACCESS_UNAVAILABLE } from "../../../../lib/auth-routing";

export default function WorkforceAccessUnavailablePage() {
  const { session, loading } = useSession();
  const router = useRouter();
  const destination = session ? workforceDestination(session) : WORKFORCE_ACCESS_UNAVAILABLE;
  useEffect(() => {
    if (loading) return;
    if (!session) router.replace("/staff/login");
    else if (destination !== WORKFORCE_ACCESS_UNAVAILABLE) router.replace(destination);
  }, [loading, session, destination, router]);
  if (loading || !session || destination !== WORKFORCE_ACCESS_UNAVAILABLE) return <Skeleton className="h-48 w-full" />;
  return <div className="space-y-5">
    <EmptyState title="No workspace access yet" detail="Your workforce account is active, but no supplier membership or platform permissions are currently assigned. Contact your organization or platform administrator to request access." />
    <div className="flex flex-wrap items-center gap-3">
      <Link className="text-sm font-semibold text-secondary hover:underline" href="/">Browse storefront</Link>
      <SignOutButton />
    </div>
  </div>;
}
