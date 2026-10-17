"use client";
import { FormEvent, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../../../lib/api";
import { Alert, Button, Card, FormField, Input } from "../../../../components/ui";

function Activation() {
  const [token, setToken] = useState("");
  useEffect(() => {
    const value = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("token") || "";
    setToken(value);
    // Drop the capability from visible browser history after capturing it.
    if (value) window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }, []);
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [newAccount, setNewAccount] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [accepted, setAccepted] = useState(false);
  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || busy) return;
    setBusy(true); setError("");
    try {
      await api.acceptStaffInvitation(token, newAccount ? password : undefined, newAccount ? displayName : undefined);
      setAccepted(true);
      // No automatic sign-in; user must authenticate using the workforce login.
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not accept invitation"); }
    finally { setBusy(false); }
  }
  return <Card>
    <h1 className="text-2xl font-bold">Join Ecom staff</h1>
    <p className="mt-2 text-sm text-foreground-muted">Accept your invitation to access an authorized supplier or platform workspace. Staff accounts are separate from customer accounts.</p>
    {accepted ? <div className="mt-5"><Alert tone="success">Invitation accepted. Sign in to continue.</Alert><Link className="mt-3 inline-block font-semibold text-secondary" href="/staff/login">Go to staff sign in</Link></div> :
      <form onSubmit={accept} className="mt-6 space-y-4">
        {!token && <Alert tone="warning">This invitation link is missing its token. Request a new invitation.</Alert>}
        {error && <Alert tone="error">{error}</Alert>}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={newAccount} onChange={e => setNewAccount(e.target.checked)}/> I am creating my workforce account for the first time</label>
        {newAccount && <>
          <FormField label="Name (optional)"><Input autoComplete="name" value={displayName} maxLength={120} onChange={e => setDisplayName(e.target.value)}/></FormField>
          <FormField label="Set your password"><Input type="password" autoComplete="new-password" minLength={12} maxLength={256} required value={password} onChange={e => setPassword(e.target.value)}/></FormField>
        </>}
        <Button type="submit" loading={busy} disabled={!token || busy}>Accept invitation</Button>
      </form>}
  </Card>;
}
export default function StaffInvitationPage() { return <Suspense><Activation/></Suspense>; }
