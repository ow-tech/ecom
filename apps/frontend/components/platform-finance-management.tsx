"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { api, type PlatformSettlement } from "../lib/api";
import { Alert, Button, Card, EmptyState, ErrorState, FormField, Input, Money, SectionHeader, Select, Skeleton, StatusBadge } from "./ui";

type Supplier = { id: string; displayName: string };
export function PlatformFinanceManagement({ permissions }: { permissions: string[] }) {
  const canRead = permissions.includes("platform.finance.read");
  const canManage = permissions.includes("platform.settlements.manage");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [settlements, setSettlements] = useState<PlatformSettlement[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [currency, setCurrency] = useState("KES");
  const [balances, setBalances] = useState<Array<{ currencyCode: string; balance: string }>>();
  const [paying, setPaying] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(canRead);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const load = useCallback(async () => {
    if (!canRead) return;
    setLoading(true); setError(undefined);
    try {
      const [supplierPage, rows] = await Promise.all([api.platformSuppliers(), api.platformFinanceSettlements()]);
      setSuppliers(supplierPage.data);
      setSettlements(rows);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load financial operations."); }
    finally { setLoading(false); }
  }, [canRead]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!supplierId || !canRead) { setBalances(undefined); return; }
    let active = true;
    void api.platformFinanceSupplierBalance(supplierId).then(result => { if (active) setBalances(result.balances); })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Balance unavailable."); });
    return () => { active = false; };
  }, [supplierId, canRead]);
  async function run(action: () => Promise<unknown>, success: string) {
    if (working) return;
    setWorking(true); setError(undefined); setNotice(undefined);
    try { await action(); setPaying(""); setReference(""); setNote(""); await load(); setNotice(success); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Operation could not be completed."); }
    finally { setWorking(false); }
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supplierId || !canManage) return;
    if (!window.confirm("Create a draft from the supplier's unclaimed eligible ledger entries? Amounts remain server-owned.")) return;
    await run(() => api.createPlatformSettlement(supplierId, currency.trim().toUpperCase()), "Draft settlement created.");
  }
  async function paid(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || !paying || !reference.trim()) return;
    if (!window.confirm("Confirm that the supplier has ALREADY been paid outside Ecom? This records an irreversible ledger acknowledgement; it does not transfer funds.")) return;
    await run(() => api.markPlatformSettlementPaid(paying, reference.trim(), note.trim()), "External supplier payment acknowledged.");
  }
  if (!canRead) return <EmptyState title="Permission denied" detail="Financial operations require platform.finance.read." />;
  return <div className="mt-7 space-y-6">
    {error && <ErrorState detail={error} retry={() => void load()} />}
    {notice && <Alert tone="success">{notice}</Alert>}
    {loading ? <Skeleton className="h-48" /> : <>
      <Card><SectionHeader title="Supplier balances" description="Balances are server-derived from append-only supplier ledgers, grouped by currency."/>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <FormField label="Supplier"><Select value={supplierId} onChange={e => setSupplierId(e.target.value)}>
            <option value="">Select supplier</option>{suppliers.map(s => <option value={s.id} key={s.id}>{s.displayName}</option>)}
          </Select></FormField>
          {balances && <div className="space-y-1">{balances.map(row => <p key={row.currencyCode} className="text-sm"><Money currency={row.currencyCode} value={row.balance}/></p>)}{!balances.length && <p className="text-sm text-foreground-muted">No ledger balance</p>}</div>}
        </div>
        {canManage && <form className="mt-5 grid gap-3 sm:grid-cols-3" onSubmit={create}>
          <FormField label="Settlement currency"><Input value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} maxLength={3} minLength={3} required/></FormField>
          <div className="sm:col-span-2 flex items-end"><Button disabled={working || !supplierId} type="submit">Create draft settlement</Button></div>
        </form>}
      </Card>
      <Card><SectionHeader title="Settlement history" description="Creating or approving a settlement never pays the supplier. Payment acknowledgement requires independent bank evidence."/>
        {!settlements.length ? <div className="mt-4"><EmptyState title="No settlements" detail="Create a draft after eligible supplier earnings are posted."/></div> :
        <div className="mt-4 space-y-4">{settlements.map(s => <div key={s.id} className="border-b border-border pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-semibold">Settlement {s.id.slice(0, 8)}</span><StatusBadge>{s.status}</StatusBadge></div>
          <p className="mt-2 text-sm"><Money currency={s.currencyCode} value={s.netAmount}/> · Supplier {suppliers.find(x => x.id === s.supplierId)?.displayName ?? s.supplierId}</p>
          {canManage && s.status === "DRAFT" && <div className="mt-3"><Button variant="outline" type="button" disabled={working}
            onClick={() => { if (window.confirm("Approve this server-derived supplier settlement?")) void run(() => api.approvePlatformSettlement(s.id), "Settlement approved."); }}>Approve settlement</Button></div>}
          {canManage && s.status === "APPROVED" && <div className="mt-3"><Button type="button" variant="outline" onClick={() => { setPaying(s.id); setReference(""); setNote(""); }}>Record externally paid</Button></div>}
        </div>)}</div>}
        {canManage && paying && <form className="mt-5 grid gap-3 sm:grid-cols-2" onSubmit={paid}>
          <div className="sm:col-span-2"><Alert tone="warning">Only record paid after external bank payment is confirmed. Ecom will not send money.</Alert></div>
          <FormField label="External payment reference"><Input required maxLength={200} value={reference} onChange={e => setReference(e.target.value)}/></FormField>
          <FormField label="Payment note"><Input maxLength={1000} value={note} onChange={e => setNote(e.target.value)}/></FormField>
          <Button type="submit" variant="destructive" disabled={working || !reference.trim()}>Acknowledge externally paid</Button>
          <Button type="button" variant="outline" onClick={() => setPaying("")}>Cancel</Button>
        </form>}
      </Card>
    </>}
  </div>;
}
