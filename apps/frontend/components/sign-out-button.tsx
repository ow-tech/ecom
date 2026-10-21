"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "./session-provider";
import { Button } from "./ui";

export function SignOutButton({ label = "Sign out", compact = false }: { label?: string; compact?: boolean }) {
  const { session, signOut } = useSession();
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();
  const leave = async () => {
    if (working) return;
    setWorking(true); setError(undefined);
    try {
      // Server revocation must succeed before client removes its session state.
      await signOut();
      window.sessionStorage.removeItem("ecom.checkout.payment-intent");
      router.replace(session?.accountAudience === "WORKFORCE" ? "/staff/login" : "/login");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to sign out. Please try again.");
    } finally { setWorking(false); }
  };
  return <span className="inline-flex flex-col items-start gap-1">
    <Button type="button" variant="outline" className={compact ? "px-2" : undefined} loading={working} onClick={() => void leave()}>{label}</Button>
    {error && <span className="max-w-48 text-xs text-destructive" role="alert">{error}</span>}
  </span>;
}
