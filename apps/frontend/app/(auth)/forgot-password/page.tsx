"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { api } from "../../../lib/api";
import { Alert, Button, FormField, Input } from "../../../components/ui";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [working, setWorking] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string>();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setWorking(true); setError(undefined);
    try { await api.requestPasswordReset(email); setSubmitted(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Password recovery is temporarily unavailable."); }
    finally { setWorking(false); }
  }
  return <><Link href="/login" className="text-sm font-semibold text-secondary">← Sign in</Link><h1 className="mt-8 text-3xl font-bold">Reset your password</h1>
    <p className="mt-3 text-sm text-foreground-muted">Enter your email address to receive a recovery link if an account exists.</p>
    {submitted ? <div className="mt-6"><Alert tone="success">If that address belongs to an account, a recovery link will be sent.</Alert></div> :
    <form className="mt-7 space-y-5" onSubmit={submit}>{error && <Alert tone="error">{error}</Alert>}
      <FormField label="Email"><Input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></FormField>
      <Button type="submit" className="w-full" loading={working}>Send recovery link</Button>
    </form>}
  </>;
}
