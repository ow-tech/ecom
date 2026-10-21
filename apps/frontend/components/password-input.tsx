"use client";

import { forwardRef, useState, type InputHTMLAttributes } from "react";
import { Input } from "./ui";

/** Password visibility is local to the field; never store credentials outside the form. */
export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, "type">>(function PasswordInput({ className, ...props }, ref) {
  const [visible, setVisible] = useState(false);
  return <div className="relative">
    <Input {...props} ref={ref} className={["pr-24", className].filter(Boolean).join(" ")} type={visible ? "text" : "password"} />
    <button type="button" aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible}
      onClick={() => setVisible(value => !value)}
      className="absolute inset-y-0 right-1 inline-flex min-w-20 items-center justify-center rounded-md px-2 text-xs font-semibold text-secondary hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary">
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="mr-1 h-4 w-4">
        {visible ? <><path d="M3 3l18 18"/><path d="M10.7 5.1A10.6 10.6 0 0 1 12 5c5.4 0 9 7 9 7a15.8 15.8 0 0 1-3.5 4.3"/><path d="M6.3 6.4A16.2 16.2 0 0 0 3 12s3.6 7 9 7c1.4 0 2.6-.4 3.8-1.1"/></> : <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>}
      </svg>
      {visible ? "Hide" : "Show"}
    </button>
  </div>;
});
