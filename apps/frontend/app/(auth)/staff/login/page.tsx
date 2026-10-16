"use client";
import Link from "next/link";
import { Suspense } from "react";
import { AuthForm } from "../../../../components/auth-form";
export default function StaffLoginPage() { return <Suspense><div>
  <Link href="/" className="text-sm font-semibold text-secondary">Back to storefront</Link>
  <h1 className="mt-8 text-3xl font-bold">Workforce sign in</h1>
  <p className="mt-3 text-sm text-foreground-muted">Use your supplier or platform staff email. Customer accounts cannot sign in here.</p>
  <div className="mt-7"><AuthForm mode="login" audience="WORKFORCE" /></div>
  <p className="mt-5 text-sm"><Link href="/login" className="font-semibold text-secondary">Customer sign in</Link></p>
</div></Suspense>; }
