"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { api } from "../../../lib/api";
import { useSession } from "../../../components/session-provider";
import { loginHref } from "../../../lib/auth-routing";
import { StorefrontHeader } from "../../../components/storefront-header";
import { Alert, Button, FormField, Input, PageHeader, Skeleton, StorefrontContainer, Surface } from "../../../components/ui";

export default function SecurityPage() {
  const { session, loading, refresh } = useSession();
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => { if (!loading && !session) router.replace(loginHref("/account/security")); }, [loading, session, router]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(undefined);
    if (next !== confirm) { setError("New passwords must match."); return; }
    if (next === current) { setError("Choose a different password."); return; }
    setWorking(true);
    try {
      await api.changePassword(current, next);
      setCurrent(""); setNext(""); setConfirm("");
      await refresh();
      router.replace("/login");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not change your password."); }
    finally { setWorking(false); }
  }
  if (!loading && !session) return null;
  return <><StorefrontHeader /><StorefrontContainer className="max-w-3xl">
    <PageHeader eyebrow="Your account" title="Account security" description="Change your password. All existing sessions will be signed out." actions={<Link href="/account" className="font-semibold text-secondary hover:underline">Back to account</Link>} />
    {loading || !session ? <Skeleton className="mt-7 h-64" /> : <Surface className="mt-7"><form onSubmit={submit} className="max-w-md space-y-5">
      {error && <Alert tone="error">{error}</Alert>}
      <FormField label="Current password"><Input type="password" autoComplete="current-password" required value={current} onChange={e => setCurrent(e.target.value)}/></FormField>
      <FormField label="New password"><Input type="password" autoComplete="new-password" minLength={12} maxLength={256} required value={next} onChange={e => setNext(e.target.value)}/></FormField>
      <FormField label="Confirm new password"><Input type="password" autoComplete="new-password" minLength={12} maxLength={256} required value={confirm} onChange={e => setConfirm(e.target.value)}/></FormField>
      <Button type="submit" loading={working}>Change password and sign out</Button>
      <p className="text-sm text-foreground-muted">Use at least 12 characters. Sign in again with your new password.</p>
    </form></Surface>}
  </StorefrontContainer></>;
}
