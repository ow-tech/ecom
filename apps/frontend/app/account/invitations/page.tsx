"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type OrganizationInvitation } from "../../../lib/api";
import { useSession } from "../../../components/session-provider";
import { loginHref } from "../../../lib/auth-routing";
import { StorefrontHeader } from "../../../components/storefront-header";
import { Alert, Button, Card, EmptyState, ErrorState, PageHeader, Skeleton, StorefrontContainer } from "../../../components/ui";

export default function OrganizationInvitationsPage() {
  const router = useRouter();
  const { session, loading: sessionLoading, refresh } = useSession();
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>();
  const [working, setWorking] = useState<string>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const load = useCallback(async () => {
    setError(undefined);
    try { setInvitations(await api.organizationInvitations()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load invitations."); }
  }, []);
  useEffect(() => { if (!sessionLoading && !session) router.replace(loginHref("/account/invitations")); }, [router, session, sessionLoading]);
  useEffect(() => { if (session) void load(); }, [session, load]);
  async function accept(invitation: OrganizationInvitation) {
    setWorking(invitation.id); setError(undefined); setNotice(undefined);
    try {
      await api.acceptOrganizationInvitation(invitation.id);
      await refresh();
      await load();
      setNotice(`You now have access to ${invitation.organizationName}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not accept invitation."); }
    finally { setWorking(undefined); }
  }
  if (!sessionLoading && !session) return null;
  return <><StorefrontHeader /><StorefrontContainer className="max-w-3xl">
    <PageHeader eyebrow="Your account" title="Organization invitations" description="Only you can accept invitations sent to your registered Ecom account." actions={<Link className="font-semibold text-secondary hover:underline" href="/account">Back to account</Link>}/>
    {error && <div className="mt-5"><ErrorState detail={error} retry={() => void load()}/></div>}
    {notice && <div className="mt-5"><Alert tone="success">{notice}</Alert></div>}
    {(sessionLoading || !invitations) && !error ? <Skeleton className="mt-6 h-40"/> : invitations?.length === 0 ? <div className="mt-6"><EmptyState title="No pending invitations" detail="Ask an organization owner to invite your registered email address."/></div> :
      <div className="mt-6 space-y-4">{invitations?.map(invitation => <Card key={invitation.id}>
        <p className="font-semibold">{invitation.organizationName}</p>
        <p className="mt-1 text-sm text-foreground-muted">Role: {invitation.roleKey?.replaceAll("_", " ").replaceAll(".", " ") ?? "Staff"}</p>
        <Button className="mt-4" type="button" loading={working === invitation.id} disabled={Boolean(working)} onClick={() => void accept(invitation)}>Accept invitation</Button>
      </Card>)}</div>}
  </StorefrontContainer></>;
}
