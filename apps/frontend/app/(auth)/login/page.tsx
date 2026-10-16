"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AuthForm } from "../../../components/auth-form";
export default function LoginPage() { return <Suspense><LoginContent /></Suspense>; }
function LoginContent() { const searchParams = useSearchParams(); const returnTo = searchParams.get("returnTo"); return <><Link href="/" className="text-lg font-extrabold text-primary lg:hidden">Ecom<span className="text-accent">.</span></Link><p className="mt-12 text-sm font-bold uppercase tracking-[.12em] text-secondary">Welcome back</p><h1 className="mt-2 text-3xl font-bold">Sign in to Ecom</h1><p className="mt-2 text-sm text-foreground-muted">Use your account to shop or access the workspaces assigned to you.</p><div className="mt-8"><AuthForm mode="login" /></div><p className="mt-6 text-center text-sm text-foreground-muted">New here? <Link className="font-semibold text-secondary hover:underline" href={returnTo ? `/register?returnTo=${encodeURIComponent(returnTo)}` : "/register"}>Create an account</Link></p></>; }
