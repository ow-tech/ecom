"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError } from "../lib/api";
import { postAuthDestination } from "../lib/auth-routing";
import { Alert, Button, FormField, Input } from "./ui";
import { useSession } from "./session-provider";
import { PasswordInput } from "./password-input";

export function AuthForm({ mode, audience = "CUSTOMER" }: { mode: "login" | "register"; audience?: "CUSTOMER" | "WORKFORCE" }) {
  const register = mode === "register"; const router = useRouter(); const searchParams = useSearchParams(); const { refresh } = useSession();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [displayName, setDisplayName] = useState(""); const [error, setError] = useState<string>(); const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(undefined); setLoading(true); try { if (register) { if (audience === "WORKFORCE") await api.workforceRegister(email, password, displayName); else await api.register(email, password, displayName); } else if (audience === "WORKFORCE") await api.workforceLogin(email, password); else await api.login(email, password); await refresh(); router.replace(audience === "WORKFORCE" ? (searchParams.get("returnTo")?.startsWith("/supplier") || searchParams.get("returnTo")?.startsWith("/platform") ? postAuthDestination(searchParams.get("returnTo")) : "/supplier") : postAuthDestination(searchParams.get("returnTo"))); } catch (cause) { setError(cause instanceof ApiError ? cause.message : "We could not reach the service. Please try again."); } finally { setLoading(false); } }
  return <form className="space-y-4" onSubmit={submit}>{error && <Alert tone="error">{error}</Alert>}{register && <FormField label="Name"><Input id="name" autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></FormField>}<FormField label="Email"><Input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></FormField><FormField label="Password"><PasswordInput id="password" autoComplete={register ? "new-password" : "current-password"} minLength={register ? 12 : undefined} required value={password} onChange={(event) => setPassword(event.target.value)} />{register && <p className="mt-1 text-xs text-foreground-muted">Use at least 12 characters.</p>}</FormField><Button type="submit" className="w-full" loading={loading}>{register ? "Create account" : "Sign in"}</Button></form>;
}
