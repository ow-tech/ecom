"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { api, type PayoutDestination, type CreatePayoutDestination } from "../lib/api";
import { Alert, Button, Card, EmptyState, ErrorState, FormField, Input, SectionHeader, Select, Skeleton, StatusBadge } from "./ui";

export function SupplierPayoutDestinations({ organizationId, permissions }: { organizationId: string; permissions: string[] }) {
  const canManage = permissions.includes("organization.members.manage");
  const [destinations, setDestinations] = useState<PayoutDestination[]>();
  const [method, setMethod] = useState<"BANK" | "MPESA">("BANK");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const reload = useCallback(async () => {
    setError(undefined);
    try { setDestinations(await api.supplierPayoutDestinations(organizationId)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load payout details."); }
  }, [organizationId]);
  useEffect(() => { void reload(); }, [reload]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || !canManage) return;
    const form = event.currentTarget;
    const fields = Object.fromEntries(new FormData(form));
    const input: CreatePayoutDestination = {
      type: method,
      currencyCode: method === "MPESA" ? "KES" : String(fields.currencyCode || "").trim().toUpperCase(),
      accountHolderName: String(fields.accountHolderName || "").trim(),
      ...(method === "MPESA" ? { mpesaPhone: String(fields.mpesaPhone || "").trim() } : {
        bankName: String(fields.bankName || "").trim(),
        bankCountryCode: String(fields.bankCountryCode || "").trim().toUpperCase(),
        iban: String(fields.iban || "").trim() || undefined,
        accountNumber: String(fields.accountNumber || "").trim() || undefined,
        swiftBic: String(fields.swiftBic || "").trim().toUpperCase(),
      }),
    };
    setBusy(true); setError(undefined); setNotice(undefined);
    try {
      await api.createSupplierPayoutDestination(organizationId, input);
      form.reset(); await reload(); setNotice("Payout instructions saved. Platform finance will still confirm each manual transfer.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save payout instructions."); }
    finally { setBusy(false); }
  }
  async function disable(id: string) {
    if (busy || !canManage || !window.confirm("Disable this payout destination? Existing settlements keep their original destination.")) return;
    setBusy(true); setError(undefined); setNotice(undefined);
    try { await api.disableSupplierPayoutDestination(organizationId, id); await reload(); setNotice("Destination disabled for new settlements."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not disable the destination."); }
    finally { setBusy(false); }
  }
  return <Card className="mt-8">
    <SectionHeader title="Bank and M-Pesa payout details" description="Used for manual supplier payouts. Account information is encrypted on the server and masked here. Commission is deducted from earnings before settlement." />
    {error && <div className="mt-4"><ErrorState detail={error} retry={() => void reload()} /></div>}
    {notice && <div className="mt-4"><Alert tone="success">{notice}</Alert></div>}
    {!destinations ? !error && <Skeleton className="mt-4 h-24" /> : destinations.length ? <ul className="mt-5 space-y-3">{destinations.map(d => <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
      <div><p className="font-semibold">{d.type === "BANK" ? d.bankName : "M-Pesa"} · {d.currencyCode}</p><p className="text-sm text-foreground-muted">{d.accountHolderName} · ending {d.maskedLastFour}</p></div>
      <div className="flex items-center gap-2"><StatusBadge>{d.isActive ? "Active" : "Disabled"}</StatusBadge>{canManage && d.isActive && <Button variant="outline" disabled={busy} onClick={() => void disable(d.id)}>Disable</Button>}</div>
    </li>)}</ul> : <div className="mt-5"><EmptyState title="No payout destinations" detail="Add a bank or M-Pesa account before requesting a manual supplier payout."/></div>}
    {canManage && <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={create}>
      <div className="sm:col-span-2"><FormField label="Payout method"><Select value={method} onChange={e => setMethod(e.target.value as "BANK" | "MPESA")}><option value="BANK">Bank transfer</option><option value="MPESA">M-Pesa</option></Select></FormField></div>
      <FormField label="Account holder / registered name"><Input name="accountHolderName" required maxLength={160} autoComplete="off" /></FormField>
      {method === "BANK" ? <>
        <FormField label="Payout currency"><Input name="currencyCode" defaultValue="KES" minLength={3} maxLength={3} required /></FormField>
        <FormField label="Bank name"><Input name="bankName" required maxLength={160} /></FormField>
        <FormField label="Bank country (ISO2)"><Input name="bankCountryCode" defaultValue="KE" minLength={2} maxLength={2} required /></FormField>
        <FormField label="IBAN (if supported)"><Input name="iban" autoComplete="off" maxLength={34}/></FormField>
        <FormField label="Account number (when no IBAN)"><Input name="accountNumber" autoComplete="off" maxLength={60}/></FormField>
        <FormField label="SWIFT / BIC"><Input name="swiftBic" autoComplete="off" maxLength={11} required/></FormField>
      </> : <FormField label="Registered M-Pesa phone"><Input name="mpesaPhone" type="tel" autoComplete="off" placeholder="+2547XXXXXXXX" required /></FormField>}
      <div className="sm:col-span-2"><Button type="submit" loading={busy}>Save payout destination</Button><p className="mt-2 text-xs text-foreground-muted">For changes, create another destination and disable the old one. Current settlements retain their selected payment instructions.</p></div>
    </form>}
  </Card>;
}
