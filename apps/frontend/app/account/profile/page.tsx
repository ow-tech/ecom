"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type CustomerProfile } from "../../../lib/api";
import { useSession } from "../../../components/session-provider";
import { loginHref } from "../../../lib/auth-routing";
import { StorefrontHeader } from "../../../components/storefront-header";
import { Alert, Button, ErrorState, FormField, Input, PageHeader, Skeleton, StorefrontContainer, Surface } from "../../../components/ui";

export default function ProfilePage() {
  const router = useRouter();
  const { session, loading: sessionLoading } = useSession();
  const [profile, setProfile] = useState<CustomerProfile>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(undefined);
    try { setProfile(await api.customerProfile()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load your profile."); }
  }, []);

  useEffect(() => { if (!sessionLoading && !session) router.replace(loginHref("/account/profile")); }, [router, session, sessionLoading]);
  useEffect(() => { if (session) void load(); }, [session, load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError(undefined); setNotice(undefined);
    const data = new FormData(event.currentTarget);
    try {
      const updated = await api.updateCustomerProfile({
        firstName: String(data.get("firstName") ?? "").trim(),
        lastName: String(data.get("lastName") ?? "").trim(),
        phone: String(data.get("phone") ?? "").trim(),
        alternativePhone: String(data.get("alternativePhone") ?? "").trim(),
      });
      setProfile(updated);
      setNotice("Your profile was updated.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save your profile.");
    } finally { setSaving(false); }
  }

  if (!sessionLoading && !session) return null;
  return <><StorefrontHeader /><StorefrontContainer className="max-w-3xl">
    <PageHeader eyebrow="Your account" title="Personal details" description="Keep your contact details up to date. Existing orders preserve their original delivery information." actions={<Link className="font-semibold text-secondary hover:underline" href="/account">Back to account</Link>} />
    {error && <div className="mt-6"><ErrorState detail={error} retry={() => void load()} /></div>}
    {notice && <div className="mt-6"><Alert tone="success">{notice}</Alert></div>}
    {(sessionLoading || !profile) ? (!error && <Skeleton className="mt-7 h-64" />) : <Surface className="mt-7"><form onSubmit={save} className="grid gap-5 sm:grid-cols-2">
      <FormField label="First name"><Input name="firstName" maxLength={120} defaultValue={profile.firstName ?? ""} autoComplete="given-name" /></FormField>
      <FormField label="Last name"><Input name="lastName" maxLength={120} defaultValue={profile.lastName ?? ""} autoComplete="family-name" /></FormField>
      <FormField label="Phone number"><Input name="phone" type="tel" maxLength={40} defaultValue={profile.phone ?? ""} autoComplete="tel" /></FormField>
      <FormField label="Alternative phone"><Input name="alternativePhone" type="tel" maxLength={40} defaultValue={profile.alternativePhone ?? ""} /></FormField>
      <p className="sm:col-span-2 text-sm text-foreground-muted">Account email: {session?.email}. Changing your email requires a separate verified identity flow.</p>
      <div className="sm:col-span-2"><Button type="submit" loading={saving}>Save profile</Button></div>
    </form></Surface>}
  </StorefrontContainer></>;
}
