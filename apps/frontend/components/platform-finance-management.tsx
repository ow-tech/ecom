"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { api, type PlatformSettlement, type PayoutDestination, type RevealedPayoutDestination } from "../lib/api";
import { Alert, Button, Card, EmptyState, ErrorState, FormField, Input, Money, SectionHeader, Select, Skeleton, StatusBadge } from "./ui";

type Supplier = { id: string; displayName: string };
export function PlatformFinanceManagement({ permissions }: { permissions: string[] }) {
  const canRead = permissions.includes("platform.finance.read");
  const canManage = permissions.includes("platform.settlements.manage");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [settlements, setSettlements] = useState<PlatformSettlement[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [currency, setCurrency] = useState("KES");
  const [destinations, setDestinations] = useState<PayoutDestination[]>([]);
  const [destinationId, setDestinationId] = useState("");
  const [payingSupplier, setPayingSupplier] = useState("");
  const [payingDestination, setPayingDestination] = useState<PayoutDestination>();
  const [revealed, setRevealed] = useState<RevealedPayoutDestination>();
  const [revealing, setRevealing] = useState(false);
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
  useEffect(() => {
    setDestinations([]); setDestinationId("");
    if (!supplierId || !canRead) return;
    let active = true;
    void api.platformSupplierPayoutDestinations(supplierId)
      .then(rows => { if (active) setDestinations(rows); })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Payout destination list unavailable."); });
    return () => { active = false; };
  }, [supplierId, canRead]);

  async function openPaid(settlement: PlatformSettlement) {
    setPaying(settlement.id); setPayingSupplier(settlement.supplierId);
    setReference(""); setNote(""); setRevealed(undefined); setPayingDestination(undefined); setError(undefined);
    if (!settlement.payoutDestinationId) return; // Historical settlement with no linked destination.
    try {
      const rows = await api.platformSupplierPayoutDestinations(settlement.supplierId);
      setPayingDestination(rows.find(row => row.id === settlement.payoutDestinationId));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Payout instructions unavailable."); }
  }
  async function reveal() {
    if (!canManage || !payingDestination || revealing) return;
    setRevealing(true); setRevealed(undefined); setError(undefined);
    try { setRevealed(await api.revealSupplierPayoutDestination(payingSupplier, payingDestination.id)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not reveal payout instructions."); }
    finally { setRevealing(false); }
  }
  async function run(action: () => Promise<unknown>, success: string) {
    if (working) return;
    setWorking(true); setError(undefined); setNotice(undefined);
    try { await action(); setPaying(""); setPayingSupplier(""); setPayingDestination(undefined); setRevealed(undefined); setReference(""); setNote(""); await load(); setNotice(success); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Operation could not be completed."); }
    finally { setWorking(false); }
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supplierId || !canManage || !destinationId) return;
    if (!window.confirm("Create a draft from the supplier's unclaimed eligible ledger entries? Amounts remain server-owned.")) return;
    await run(() => api.createPlatformSettlement(supplierId, currency.trim().toUpperCase(), destinationId), "Draft settlement created from net earnings after commission.");
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
          <FormField label="Settlement currency"><Input value={currency} onChange={e => { setCurrency(e.target.value.toUpperCase()); setDestinationId(""); }} maxLength={3} minLength={3} required/></FormField>
          <FormField label="Payout destination"><Select value={destinationId} onChange={e => setDestinationId(e.target.value)} required>
            <option value="">Choose bank or M-Pesa</option>
            {destinations.filter(d => d.isActive && d.currencyCode === currency).map(d => <option key={d.id} value={d.id}>{d.type === "BANK" ? d.bankName : "M-Pesa"} · {d.accountHolderName} · ending {d.maskedLastFour}</option>)}
          </Select></FormField>
          <div className="sm:col-span-2"><Button disabled={working || !supplierId || !destinationId} type="submit">Create draft settlement</Button>
            {supplierId && !destinations.some(d => d.isActive && d.currencyCode === currency) && <p className="mt-2 text-sm text-foreground-muted">Supplier must register a payout destination supporting {currency} before a new draft can be created.</p>}
          </div>
        </form>}
      </Card>
      <Card><SectionHeader title="Settlement history" description="Creating or approving a settlement never pays the supplier. Payment acknowledgement requires independent bank evidence."/>
        {!settlements.length ? <div className="mt-4"><EmptyState title="No settlements" detail="Create a draft after eligible supplier earnings are posted."/></div> :
        <div className="mt-4 space-y-4">{settlements.map(s => <div key={s.id} className="border-b border-border pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-semibold">Settlement {s.id.slice(0, 8)}</span><StatusBadge>{s.status}</StatusBadge></div>
          <p className="mt-2 text-sm"><Money currency={s.currencyCode} value={s.netAmount}/> · Supplier {suppliers.find(x => x.id === s.supplierId)?.displayName ?? s.supplierId}</p>
          {canManage && s.status === "DRAFT" && <div className="mt-3"><Button variant="outline" type="button" disabled={working}
            onClick={() => { if (window.confirm("Approve this server-derived supplier settlement?")) void run(() => api.approvePlatformSettlement(s.id), "Settlement approved."); }}>Approve settlement</Button></div>}
          {canManage && s.status === "APPROVED" && <div className="mt-3"><Button type="button" variant="outline" onClick={() => void openPaid(s)}>Record externally paid</Button></div>}
        </div>)}</div>}
        {canManage && paying && <form className="mt-5 grid gap-3 sm:grid-cols-2" onSubmit={paid}>
          <div className="sm:col-span-2"><Alert tone="warning">Only record paid after a bank or M-Pesa transfer is independently confirmed. Ecom does not initiate payouts. The settlement amount is already net of platform commission.</Alert></div>
          <div className="sm:col-span-2 rounded-lg border border-border p-3">
            {payingDestination ? <>
              <p className="text-sm font-semibold">Destination: {payingDestination.type === "BANK" ? payingDestination.bankName : "M-Pesa"} · {payingDestination.currencyCode} · {payingDestination.accountHolderName} · ending {payingDestination.maskedLastFour}</p>
              {!revealed ? <Button type="button" variant="outline" disabled={revealing} onClick={() => void reveal()}>Reveal payout instructions</Button> :
                <div className="mt-3 space-y-1 text-sm">
                  {revealed.mpesaPhone && <p>Registered M-Pesa number: {revealed.mpesaPhone}</p>}
                  {revealed.iban && <p>IBAN: {revealed.iban}</p>}
                  {revealed.accountNumber && <p>Bank account: {revealed.accountNumber}</p>}
                  {revealed.swiftBic && <p>SWIFT/BIC: {revealed.swiftBic}</p>}
                  <Button type="button" variant="outline" onClick={() => setRevealed(undefined)}>Hide payout instructions</Button>
                </div>}
            </> : <p className="text-sm text-foreground-muted">This legacy settlement does not have a linked payout destination. Verify the recipient independently before acknowledging any payment.</p>}
          </div>
          <FormField label="External payment reference"><Input required maxLength={200} value={reference} onChange={e => setReference(e.target.value)}/></FormField>
          <FormField label="Payment note"><Input maxLength={1000} value={note} onChange={e => setNote(e.target.value)}/></FormField>
          <Button type="submit" variant="destructive" disabled={working || !reference.trim()}>Acknowledge externally paid</Button>
          <Button type="button" variant="outline" onClick={() => { setPaying(""); setPayingSupplier(""); setRevealed(undefined); setPayingDestination(undefined); }}>Cancel</Button>
        </form>}
      </Card>
    </>}
  </div>;
}
