"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AuthForm } from "../../../components/auth-form";
export default function RegisterPage() { return <Suspense><RegisterContent /></Suspense>; }
function RegisterContent() { const searchParams = useSearchParams(); const returnTo = searchParams.get("returnTo"); return <><Link href="/" className="text-lg font-extrabold text-primary lg:hidden">Ecom<span className="text-accent">.</span></Link><p className="mt-12 text-sm font-bold uppercase tracking-[.12em] text-secondary">Get started</p><h1 className="mt-2 text-3xl font-bold">Create your account</h1><p className="mt-2 text-sm text-foreground-muted">Create a customer-only account. Supplier and platform workspaces require a separate workforce email.</p><div className="mt-8"><AuthForm mode="register" /></div><p className="mt-6 text-center text-sm text-foreground-muted">Already have an account? <Link className="font-semibold text-secondary hover:underline" href={returnTo ? `/login?returnTo=${encodeURIComponent(returnTo)}` : "/login"}>Sign in</Link></p></>; }
