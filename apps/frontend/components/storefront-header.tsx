"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { loginHref } from "../lib/auth-routing";
import { useCart } from "./cart-provider";
import { FlyToCart } from "./fly-to-cart";
import { useSession } from "./session-provider";

function CartIcon() {
  return <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-2"><path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 1.9-1.4L20 8H7" /><circle cx="10" cy="20" r="1" /><circle cx="17" cy="20" r="1" /></svg>;
}

export function StorefrontHeader() {
  const { session, loading } = useSession(); const { count } = useCart(); const pathname = usePathname();
  const cartTarget = useRef<HTMLSpanElement>(null); const [arrived, setArrived] = useState(false); const arrive = useCallback(() => setArrived(true), []);
  useEffect(() => { if (!arrived) return; if (!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) cartTarget.current?.animate([{ transform: "scale(1)" }, { transform: "scale(1.13)", offset: .45 }, { transform: "scale(1)" }], { duration: 360, easing: "ease-out" }); const timer = window.setTimeout(() => setArrived(false), 400); return () => window.clearTimeout(timer); }, [arrived, count]);
  return <header className="sticky top-0 z-30 border-b border-border bg-surface/95 shadow-sm backdrop-blur">
    <nav className="mx-auto flex min-h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:h-16 sm:px-5" aria-label="Storefront">
      <Link href="/" className="shrink-0 text-lg font-extrabold tracking-tight text-primary">Ecom<span className="text-accent">.</span></Link>
      <div className="flex items-center gap-1 sm:gap-2">{!loading && (session ? <><Link className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-2 text-foreground hover:bg-muted" href="/cart" aria-label={`Cart, ${count} item${count === 1 ? "" : "s"}`}><span ref={cartTarget} className="relative inline-flex h-8 w-8 items-center justify-center"><CartIcon /><span className="absolute -right-2 -top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold leading-4 text-white" aria-live="polite" aria-label={`${count} cart items`}>{count}</span></span></Link><Link className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-3 text-sm font-semibold text-white" href="/account">Account</Link></> : <><Link className="inline-flex min-h-11 items-center justify-center rounded-lg px-3 text-sm font-semibold text-foreground hover:bg-muted" href={loginHref(pathname)}>Sign in</Link><Link className="hidden min-h-11 items-center justify-center rounded-lg bg-primary px-3 text-sm font-semibold text-white sm:inline-flex" href={`/register?returnTo=${encodeURIComponent(pathname)}`}>Join Ecom</Link></>)}</div>
    </nav>{session && <FlyToCart target={cartTarget} onArrival={arrive} />}
  </header>;
}
