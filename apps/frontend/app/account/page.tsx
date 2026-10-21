"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "../../components/session-provider";
import { loginHref } from "../../lib/auth-routing";
import { api, type CustomerProfile, type CustomerAddress } from "../../lib/api";
import { Card, EmptyState, PageHeader, Skeleton } from "../../components/ui";

type SavedDetails = { profile: CustomerProfile; addresses: CustomerAddress[] };
const shown = (value?: string | null) => value?.trim() || "Not added";

export default function AccountPage() {
  const { session, loading } = useSession();
  const router = useRouter();
  const isCustomer = session?.accountAudience === "CUSTOMER";
  const [details, setDetails] = useState<SavedDetails>();
  const [detailsError, setDetailsError] = useState<string>();

  useEffect(() => { if (!loading && !session) router.replace(loginHref("/account")); }, [loading, session, router]);
  useEffect(() => {
    if (!isCustomer) { setDetails(undefined); setDetailsError(undefined); return; }
    let active = true;
    setDetails(undefined); setDetailsError(undefined);
    void Promise.all([api.customerProfile(), api.customerAddresses()]).then(([profile, addresses]) => {
      if (active) setDetails({ profile, addresses });
    }).catch(cause => {
      if (active) setDetailsError(cause instanceof Error ? cause.message : "Could not load saved account details.");
    });
    return () => { active = false; };
  }, [isCustomer, session?.id]);

  if (loading || !session) return <main className="p-6"><Skeleton className="h-8 w-64" /></main>;
  const defaultAddress = details?.addresses.find(address => address.isDefault) ?? details?.addresses[0];
  const personName = details ? [details.profile.firstName, details.profile.lastName].filter(Boolean).join(" ") : "";
  return <main className="mx-auto max-w-5xl p-5 sm:p-8">
    <PageHeader eyebrow="Your account" title={`Welcome, ${personName || session.displayName || "there"}`} description="Your saved information and authorized workspaces." />
    <div className="mt-8 grid gap-5 md:grid-cols-2">
      {isCustomer && <Card>
        <h2 className="text-lg font-bold">Your saved details</h2>
        {detailsError && <p role="alert" className="mt-3 text-sm text-danger">{detailsError}</p>}
        {!details && !detailsError && <Skeleton className="mt-4 h-28" />}
        {details && <dl className="mt-4 space-y-3 text-sm">
          <div><dt className="text-foreground-muted">Full name</dt><dd className="font-semibold">{shown(personName)}</dd></div>
          <div><dt className="text-foreground-muted">Account email</dt><dd className="font-semibold">{session.email}</dd></div>
          <div><dt className="text-foreground-muted">Phone number</dt><dd className="font-semibold">{shown(details.profile.phone)}</dd></div>
          <div><dt className="text-foreground-muted">Alternative phone</dt><dd className="font-semibold">{shown(details.profile.alternativePhone)}</dd></div>
          <div><dt className="text-foreground-muted">Saved addresses</dt><dd className="font-semibold">{details.addresses.length}</dd></div>
          <div><dt className="text-foreground-muted">Default delivery address</dt><dd className="font-semibold">{defaultAddress ? `${defaultAddress.label || defaultAddress.recipientName} — ${defaultAddress.city}, ${defaultAddress.region}` : "Not added"}</dd></div>
        </dl>}
        <div className="mt-5 flex flex-wrap gap-4">
          <Link className="text-sm font-bold text-secondary hover:underline" href="/account/profile">Edit profile</Link>
          <Link className="text-sm font-bold text-secondary hover:underline" href="/account/addresses">Manage addresses</Link>
          <Link className="text-sm font-bold text-secondary hover:underline" href="/account/security">Account security</Link>
          <Link className="text-sm font-bold text-secondary hover:underline" href="/account/orders">My orders</Link>
          <Link className="text-sm font-bold text-secondary hover:underline" href="/account/notifications">Notifications</Link>
          <Link className="text-sm font-bold text-secondary hover:underline" href="/account/support">Support</Link>
        </div>
      </Card>}
      {session.organizations.length ? session.organizations.map(organization => <Card key={organization.id}>
        <p className="text-xs font-bold uppercase tracking-[.1em] text-secondary">Organization workspace</p>
        <h2 className="mt-2 text-lg font-bold">{organization.name}</h2>
        <p className="mt-2 text-sm text-foreground-muted">{organization.permissions.length} active permissions</p>
        <Link className="mt-5 inline-block text-sm font-bold text-secondary hover:underline" href={`/supplier/${organization.id}`}>Open supplier workspace</Link>
      </Card>) : isCustomer ? <EmptyState title="No organization workspace" detail="Your customer account is ready to shop." /> : null}
      {session.platformPermissions.length > 0 && <Card>
        <p className="text-xs font-bold uppercase tracking-[.1em] text-secondary">Platform staff</p>
        <h2 className="mt-2 text-lg font-bold">Platform operations</h2>
        <p className="mt-2 text-sm text-foreground-muted">Access is based on active platform-role permissions.</p>
        <Link className="mt-5 inline-block text-sm font-bold text-secondary hover:underline" href="/platform">Open platform workspace</Link>
      </Card>}
    </div>
  </main>;
}
