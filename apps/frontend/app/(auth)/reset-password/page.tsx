"use client";

import Link from "next/link";
import { type FormEvent, Suspense, useEffect, useState } from "react";
import { api } from "../../../lib/api";
import { Alert, Button, FormField } from "../../../components/ui";
import { PasswordInput } from "../../../components/password-input";

function ResetContent() {
  const [token, setToken] = useState("");
  useEffect(() => {
    const fragmentToken = new URLSearchParams(window.location.hash.slice(1)).get("token");
    const legacyToken = new URLSearchParams(window.location.search).get("token");
    setToken(fragmentToken || legacyToken || "");
    if (fragmentToken || legacyToken) window.history.replaceState(null, "", "/reset-password");
  }, []);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [working, setWorking] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string>();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(undefined);
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setWorking(true);
    try {
      await api.resetPassword(token, password);
      setComplete(true); setPassword(""); setConfirm("");
      window.history.replaceState(null, "", "/reset-password");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "This recovery link is invalid or expired."); }
    finally { setWorking(false); }
  }
  return <><h1 className="text-3xl font-bold">Set a new password</h1>
    {!token && !complete ? <div className="mt-6"><Alert tone="error">The recovery token is missing.</Alert><Link className="mt-4 inline-block text-secondary" href="/forgot-password">Request a new link</Link></div> :
      complete ? <div className="mt-6"><Alert tone="success">Password updated. All previous sessions were signed out.</Alert><Link className="mt-5 inline-block font-semibold text-secondary" href="/login">Sign in</Link></div> :
      <form className="mt-7 space-y-5" onSubmit={submit}>{error && <Alert tone="error">{error}</Alert>}
        <FormField label="New password"><PasswordInput autoComplete="new-password" minLength={12} maxLength={256} required value={password} onChange={e => setPassword(e.target.value)} /></FormField>
        <FormField label="Confirm password"><PasswordInput autoComplete="new-password" minLength={12} maxLength={256} required value={confirm} onChange={e => setConfirm(e.target.value)} /></FormField>
        <Button type="submit" className="w-full" loading={working}>Save new password</Button>
      </form>}
  </>;
}
export default function ResetPasswordPage() { return <Suspense><ResetContent /></Suspense>; }
