"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { DeliveryOperations } from "./platform-delivery-operations";
import { api } from "../lib/api";
import { Alert, Button, Card, FormField, Input, Money, SectionHeader, Select, Skeleton, StatusBadge } from "./ui";

type Row = { id: string; name?: string; status?: string; [key: string]: any };
type View = { points: Row[]; zones: Row[]; rates: Row[]; quotes: Row[] };
const initial: View = { points: [], zones: [], rates: [], quotes: [] };
const values = (event: FormEvent<HTMLFormElement>) => Object.fromEntries(new FormData(event.currentTarget));

// These controls change platform configuration, never the immutable order
// snapshots or supplier inventory locations used by historical checkout.
export function DeliveryManagement({ permissions }: { permissions: string[] }) {
  const pickupRead = permissions.includes("platform.pickup_points.read");
  const pickupManage = permissions.includes("platform.pickup_points.manage");
  const deliveryManage = permissions.includes("platform.delivery.manage");
  const quoteManage = permissions.includes("platform.delivery.quote");
  const [rows, setRows] = useState<View>(initial);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [editing, setEditing] = useState<{ kind: "point" | "zone" | "rate"; row: Row }>();
  const [quoteId, setQuoteId] = useState<string>();
  const load = useCallback(async () => {
    setLoading(true); setError(undefined);
    try {
      const [points, zones, rates, quotes] = await Promise.all([
        pickupRead ? api.platformPickupPoints() : Promise.resolve([]),
        api.platformDeliveryZones(), api.platformDeliveryRates(), api.platformDeliveryQuotes(),
      ]);
      setRows({ points, zones, rates, quotes });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Delivery configuration could not be loaded."); }
    finally { setLoading(false); }
  }, [pickupRead]);
  useEffect(() => { void load(); }, [load]);
  async function run(action: () => Promise<unknown>, success?: () => void) {
    if (busy) return;
    setBusy(true); setError(undefined); setNotice(undefined);
    try { await action(); success?.(); await load(); setNotice("Changes saved."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save changes."); }
    finally { setBusy(false); }
  }
  function point(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const input = values(event);
    void run(() => api.createPickupPoint({ ...input, countryCode: String(input.countryCode).toUpperCase() }), () => form.reset());
  }
  function zone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const input = values(event);
    void run(() => api.createDeliveryZone({ name: input.name, countryCode: String(input.countryCode).toUpperCase(), region: input.region || undefined, city: input.city || undefined }), () => form.reset());
  }
  function rate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const input = values(event);
    void run(() => api.createDeliveryRate({ ...input, currencyCode: String(input.currencyCode).toUpperCase() }), () => form.reset());
  }
  function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editing) return;
    const input = values(event); const { kind, row } = editing;
    void run(() => kind === "point" ? api.updatePickupPoint(row.id, input) : kind === "zone" ? api.updateDeliveryZone(row.id, input) : api.updateDeliveryRate(row.id, input), () => setEditing(undefined));
  }
  function saveQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!quoteId) return;
    const input = values(event);
    const expiresAt = input.expiresAt ? new Date(String(input.expiresAt)).toISOString() : undefined;
    void run(() => api.setDeliveryQuote(quoteId, { amount: input.amount, reason: input.reason || undefined, expiresAt }), () => setQuoteId(undefined));
  }
  return <div className="mt-7 space-y-7">
    <DeliveryOperations />
    {error && <Alert tone="error">{error}</Alert>}{notice && <Alert tone="success">{notice}</Alert>}
    {loading ? <Skeleton className="h-48" /> : <>
      {pickupRead && <Card><SectionHeader title="Pickup points" description="Only active locations are available during checkout. Fees are priced in the configured currency. Existing records were backfilled as KES." />
        <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>Name</th><th>Location</th><th>Fee</th><th>Status</th><th>Action</th></tr></thead><tbody>{rows.points.map(p => <tr key={p.id} className="border-t border-border"><td className="p-2">{p.name}</td><td className="p-2">{p.city}, {p.region}</td><td className="p-2"><Money value={p.pickupFee} currency={p.currencyCode} /></td><td className="p-2"><StatusBadge>{p.status}</StatusBadge></td><td className="p-2">{pickupManage && <Button variant="outline" disabled={busy} onClick={() => setEditing({ kind: "point", row: p })}>Edit</Button>}</td></tr>)}</tbody></table></div>
        {pickupManage && <form className="mt-5 grid gap-3 sm:grid-cols-3" onSubmit={point}>
          <FormField label="Point name"><Input name="name" required maxLength={160}/></FormField>
          <FormField label="Point code"><Input name="code" required maxLength={80}/></FormField>
          <FormField label="Slug"><Input name="slug" required maxLength={180}/></FormField>
          <FormField label="Pickup country (ISO2)"><Input name="countryCode" required minLength={2} maxLength={2} defaultValue="KE"/></FormField>
          <FormField label="Region / county"><Input name="region" required/></FormField>
          <FormField label="City / town"><Input name="city" required/></FormField>
          <FormField label="Address"><Input name="address" required/></FormField>
          <FormField label="Pickup fee currency"><Input name="currencyCode" defaultValue="KES" minLength={3} maxLength={3} required/></FormField>
          <FormField label="Collection fee"><Input name="pickupFee" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" defaultValue="0.00" required/></FormField>
          <div className="flex items-end"><Button type="submit" disabled={busy}>Create pickup point</Button></div>
        </form>}
      </Card>}
      <Card><SectionHeader title="Delivery zones" description="Manage geographical coverage. Existing orders keep their original snapshots." />
        <div className="mt-4 space-y-3">{rows.zones.map(z => <div key={z.id} className="flex flex-wrap justify-between gap-3 border-b border-border pb-2"><span className="text-sm">{z.name} · {z.countryCode} · {z.region || "Any region"} · {z.city || "Any city"} <StatusBadge>{z.status}</StatusBadge></span>{deliveryManage && <Button variant="outline" disabled={busy} onClick={() => setEditing({ kind: "zone", row: z })}>Edit zone</Button>}</div>)}</div>
        {deliveryManage && <form className="mt-5 grid gap-3 sm:grid-cols-3" onSubmit={zone}>
          <FormField label="Zone name"><Input name="name" required/></FormField>
          <FormField label="Delivery country (ISO2)"><Input name="countryCode" required minLength={2} maxLength={2} defaultValue="KE"/></FormField>
          <FormField label="Region / county"><Input name="region"/></FormField>
          <FormField label="City (optional)"><Input name="city"/></FormField>
          <div className="flex items-end"><Button type="submit" disabled={busy}>Create zone</Button></div>
        </form>}
      </Card>
      <Card><SectionHeader title="Delivery rates" description="Automatic delivery rates apply to new checkouts." />
        <div className="mt-4 space-y-3">{rows.rates.map(r => <div key={r.id} className="flex flex-wrap justify-between gap-3 border-b border-border pb-2"><span className="text-sm">{r.name} · <Money currency={r.currencyCode} value={r.amount} /> · {r.deliveryZone?.name ?? r.deliveryZoneId} · <StatusBadge>{r.status}</StatusBadge></span>{deliveryManage && <Button variant="outline" disabled={busy} onClick={() => setEditing({ kind: "rate", row: r })}>Edit rate</Button>}</div>)}</div>
        {deliveryManage && <form className="mt-5 grid gap-3 sm:grid-cols-4" onSubmit={rate}>
          <FormField label="Zone"><Select name="deliveryZoneId" required><option value="">Select zone</option>{rows.zones.map(z => <option value={z.id} key={z.id}>{z.name}</option>)}</Select></FormField>
          <FormField label="Rate name"><Input name="name" required/></FormField>
          <FormField label="Currency"><Input name="currencyCode" defaultValue="KES" minLength={3} maxLength={3} required/></FormField>
          <FormField label="Amount"><Input name="amount" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" required/></FormField>
          <div><Button type="submit" disabled={busy}>Create rate</Button></div>
        </form>}
      </Card>
      <Card><SectionHeader title="Manual delivery quotes" description="A customer must accept a current quote before Paystack initialization." />
        <div className="mt-4 space-y-3">{rows.quotes.map(q => <div key={q.id} className="flex flex-wrap justify-between gap-3 border-b border-border pb-3"><span className="text-sm">{q.order?.orderNumber ?? q.orderId} · {q.status} {q.amount && (q.currencyCode ? <Money currency={q.currencyCode} value={String(q.amount)} /> : <span className="tabular-nums">{String(q.amount)}</span>)}</span>{quoteManage && q.status === "PENDING" && <Button variant="outline" disabled={busy} onClick={() => setQuoteId(q.id)}>Provide quote</Button>}</div>)}</div>
        {quoteManage && quoteId && <form className="mt-5 grid gap-3 sm:grid-cols-3" onSubmit={saveQuote}>
          <FormField label="Quoted amount"><Input name="amount" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" required/></FormField>
          <FormField label="Reason"><Input name="reason"/></FormField>
          <FormField label="Valid until"><Input name="expiresAt" type="datetime-local"/></FormField>
          <Button type="submit" disabled={busy}>Save quote</Button><Button type="button" variant="outline" onClick={() => setQuoteId(undefined)}>Cancel</Button>
        </form>}
      </Card>
      {editing && <Card><SectionHeader title={`Edit ${editing.kind}`} description="Configuration changes never rewrite order history." />
        <form key={editing.row.id} className="mt-5 grid gap-4 sm:grid-cols-3" onSubmit={saveEdit}>
          <FormField label="Name"><Input name="name" defaultValue={editing.row.name ?? ""} required/></FormField>
          {editing.kind === "point" && <>
            <FormField label="Address"><Input name="address" defaultValue={editing.row.address} required/></FormField>
            <FormField label="City"><Input name="city" defaultValue={editing.row.city} required/></FormField>
            <FormField label="Region"><Input name="region" defaultValue={editing.row.region} required/></FormField>
            <FormField label="Pickup fee"><Input name="pickupFee" defaultValue={editing.row.pickupFee} required/></FormField>
          </>}
          {editing.kind === "zone" && <>
            <FormField label="Region"><Input name="region" defaultValue={editing.row.region ?? ""}/></FormField>
            <FormField label="City"><Input name="city" defaultValue={editing.row.city ?? ""}/></FormField>
          </>}
          {editing.kind === "rate" && <FormField label="Amount"><Input name="amount" defaultValue={editing.row.amount} required/></FormField>}
          <FormField label="Status"><Select name="status" defaultValue={editing.row.status}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></Select></FormField>
          <div className="flex items-end gap-2"><Button type="submit" disabled={busy}>Save</Button><Button type="button" variant="outline" onClick={() => setEditing(undefined)}>Cancel</Button></div>
        </form>
      </Card>}
    </>}
  </div>;
}
