"use client";
import Link from "next/link";
import { Suspense } from "react";
import { AuthForm } from "../../../../components/auth-form";
export default function WorkforceSignupPage() { return <Suspense><div>
  <Link href="/staff/login" className="text-sm font-semibold text-secondary">Back to staff sign in</Link>
  <h1 className="mt-8 text-3xl font-bold">Development workforce registration</h1>
  <p className="mt-3 text-sm text-foreground-muted">Available only in local/test environments. Production workforce onboarding is invitation-only: ask your supplier or platform administrator to invite your email. Development registration is only for test fixtures; customer email addresses cannot be reused.</p>
  <div className="mt-7"><AuthForm mode="register" audience="WORKFORCE" /></div>
</div></Suspense>; }
