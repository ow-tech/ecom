"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api, type AfterSalesRequest, type CustomerOrder, type WarrantyClaimSummary } from "../lib/api";
import { useSession } from "./session-provider";
import { loginHref } from "../lib/auth-routing";
import { StorefrontHeader } from "./storefront-header";
import { Alert, Button, Card, EmptyState, ErrorState, FormField, Input, PageHeader, Select, Skeleton, StatusBadge, StorefrontContainer, Textarea } from "./ui";

type RequestKind = "REFUND" | "RETURN" | "WARRANTY";
const reasonOptions = [
  ["DAMAGED", "Damaged"], ["WRONG_ITEM", "Wrong item"], ["DEFECTIVE", "Defective"],
  ["NOT_AS_DESCRIBED", "Not as described"], ["CHANGED_MIND", "Changed my mind"], ["OTHER", "Other"],
] as const;
const refundReasons = [["DAMAGED", "Damaged"], ["DEFECTIVE", "Defective"], ["WRONG_ITEM", "Wrong item"], ["OTHER", "Other"]] as const;

export function CustomerAfterSales() {
  const { orderId } = useParams<{ orderId: string }>();
  const router = useRouter();
  const { session, loading: sessionLoading } = useSession();
  const [order, setOrder] = useState<CustomerOrder>();
  const [refunds, setRefunds] = useState<AfterSalesRequest[]>([]);
  const [returns, setReturns] = useState<AfterSalesRequest[]>([]);
  const [warranties, setWarranties] = useState<WarrantyClaimSummary[]>([]);
  const [kind, setKind] = useState<RequestKind>("RETURN");
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState("DAMAGED");
  const [details, setDetails] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const load = useCallback(async () => {
    setLoading(true); setError(undefined);
    try {
      // Ownership is enforced by each customer-scoped endpoint.
      const [owned, refundRows, returnRows, warrantyRows] = await Promise.all([
        api.customerOrder(orderId), api.customerRefundRequests(orderId), api.customerReturns(orderId), api.customerWarranties(),
      ]);
      setOrder(owned); setRefunds(refundRows); setReturns(returnRows); setWarranties(warrantyRows);
      setItemId(previous => owned.items.some(i => i.id === previous) ? previous : owned.items[0]?.id ?? "");
    } catch (cause) {
      setOrder(undefined);
      setError(cause instanceof Error ? cause.message : "Could not load the order's after-sales details.");
    } finally { setLoading(false); }
  }, [orderId]);
  useEffect(() => { if (!sessionLoading && !session) router.replace(loginHref(`/account/orders/${orderId}/after-sales`)); }, [sessionLoading, session, router, orderId]);
  useEffect(() => { if (session) void load(); }, [session, load]);
  const selected = order?.items.find(row => row.id === itemId);
  const ownedItemIds = useMemo(() => new Set(order?.items.map(i => i.id) ?? []), [order]);
  const matchingWarranties = warranties.filter(w => ownedItemIds.has(w.orderItemId));
  const eligible = Boolean(order && order.status === "DELIVERED" && order.paymentStatus === "PAID");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!eligible || !selected || working) return;
    if (kind !== "WARRANTY" && (!Number.isInteger(quantity) || quantity < 1 || quantity > selected.quantity)) {
      setError("Choose a valid quantity for this order item."); return;
    }
    if (kind === "WARRANTY" && !details.trim()) { setError("Describe the warranty issue."); return; }
    setWorking(true); setError(undefined); setNotice(undefined);
    try {
      if (kind === "REFUND") await api.createCustomerRefundRequest(orderId, { reasonCode: reason, reasonText: details.trim() || undefined, items: [{ orderItemId: itemId, quantity }] });
      else if (kind === "RETURN") await api.createCustomerReturn(orderId, { reasonCode: reason, reasonText: details.trim() || undefined, items: [{ orderItemId: itemId, quantity }] });
      else await api.createCustomerWarranty({ orderItemId: itemId, issueDescription: details.trim() });
      setDetails(""); setQuantity(1);
      await load();
      setNotice("Request submitted. Its status will update after review.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We could not submit this request.");
    } finally { setWorking(false); }
  }
  if (!sessionLoading && !session) return null;
  return <><StorefrontHeader/><StorefrontContainer className="max-w-4xl">
    <PageHeader eyebrow="Your orders" title="Returns, refunds & warranties" description="Use your delivered order items. Refund amounts and eligibility are verified by the platform." actions={<Link className="font-semibold text-secondary hover:underline" href={`/checkout/payment/${orderId}`}>Back to order</Link>}/>
    {error && <div className="mt-6"><ErrorState detail={error} retry={() => void load()}/></div>}
    {notice && <div className="mt-6"><Alert tone="success">{notice}</Alert></div>}
    {loading && !order ? <Skeleton className="mt-6 h-56"/> : order && <>
      <Card className="mt-6"><h2 className="font-semibold">Order {order.orderNumber}</h2><p className="mt-1 text-sm text-foreground-muted">{order.status.replaceAll("_", " ")} · {order.items.length} item line(s)</p>
        {!eligible ? <div className="mt-4"><Alert tone="info">Requests can be submitted only after this order has been paid and delivered. Existing requests remain visible below.</Alert></div> :
        <form className="mt-5 space-y-5" onSubmit={submit}>
          <FormField label="Request type"><Select value={kind} onChange={e => { setKind(e.target.value as RequestKind); setReason("DAMAGED"); setQuantity(1); setError(undefined); }}><option value="RETURN">Return</option><option value="REFUND">Refund request</option><option value="WARRANTY">Warranty claim</option></Select></FormField>
          <FormField label="Purchased item"><Select value={itemId} onChange={e => { setItemId(e.target.value); setQuantity(1); }} required>
            {order.items.map(item => <option value={item.id} key={item.id}>{item.productNameSnapshot}{item.variantNameSnapshot ? ` — ${item.variantNameSnapshot}` : ""} (purchased: {item.quantity})</option>)}</Select></FormField>
          {kind !== "WARRANTY" && <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Quantity"><Input type="number" min={1} max={selected?.quantity ?? 1} step={1} value={quantity} onChange={e => setQuantity(Number(e.target.value))} required/></FormField>
            <FormField label="Reason"><Select value={reason} onChange={e => setReason(e.target.value)}>
              {(kind === "RETURN" ? reasonOptions : refundReasons).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select></FormField>
          </div>}
          {kind === "WARRANTY" && selected?.warrantyDaysSnapshot === 0 && <Alert tone="warning">This item has no warranty period. The server will reject an ineligible claim.</Alert>}
          <FormField label={kind === "WARRANTY" ? "Describe the issue" : "Additional details"}><Textarea value={details} maxLength={kind === "WARRANTY" ? 2000 : 1000} required={kind === "WARRANTY"} onChange={e => setDetails(e.target.value)} placeholder="Describe the problem and what happened."/></FormField>
          <Button type="submit" disabled={working || !itemId || (kind === "WARRANTY" && !selected?.warrantyDaysSnapshot)} loading={working}>Submit {kind === "WARRANTY" ? "warranty claim" : kind === "REFUND" ? "refund request" : "return request"}</Button>
          <p className="text-xs text-foreground-muted">Submission is not an approval, refund confirmation, or promise of replacement. The platform reviews your request.</p>
        </form>}
      </Card>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Card><h3 className="font-semibold">Refund requests</h3><div className="mt-3 space-y-2">{refunds.length ? refunds.map(r => <div key={r.id} className="text-sm"><span>{r.id.slice(0, 8)}</span> <StatusBadge>{r.status}</StatusBadge></div>) : <p className="text-sm text-foreground-muted">No refund requests.</p>}</div></Card>
        <Card><h3 className="font-semibold">Return requests</h3><div className="mt-3 space-y-2">{returns.length ? returns.map(r => <div key={r.id} className="text-sm"><span>{r.id.slice(0, 8)}</span> <StatusBadge>{r.status}</StatusBadge></div>) : <p className="text-sm text-foreground-muted">No return requests.</p>}</div></Card>
        <Card><h3 className="font-semibold">Warranty claims</h3><div className="mt-3 space-y-2">{matchingWarranties.length ? matchingWarranties.map(r => <div key={r.id} className="text-sm"><span>{r.id.slice(0, 8)}</span> <StatusBadge>{r.status}</StatusBadge></div>) : <p className="text-sm text-foreground-muted">No warranty claims.</p>}</div></Card>
      </div>
    </>}
  </StorefrontContainer></>;
}
