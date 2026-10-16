"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { Alert, Button, Card, EmptyState, ErrorState, FormField, Input, SectionHeader, Select, Skeleton, StatusBadge } from "./ui";

type Refund = { id: string; status: string; requestedAmount?: string | null; refund?: { id: string; status: string; amount: string } | null };
type ReturnRow = { id: string; status: string; orderId?: string };
type WarrantyRow = { id: string; status: string; orderItemId?: string };
type Choice = { id: string; resolution: string; note: string };
const returnResolutions = ["REFUND", "REPLACEMENT", "NO_ACTION"];
const warrantyResolutions = ["REPAIR", "REPLACEMENT", "REFUND", "NO_FAULT_FOUND"];

export function PlatformAfterSales({ permissions }: { permissions: string[] }) {
  const refundRead = permissions.includes("platform.refunds.read");
  const returnRead = permissions.includes("platform.returns.read");
  const warrantyRead = permissions.includes("platform.warranties.read");
  const can = (key: string) => permissions.includes(key);
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [returns, setReturns] = useState<ReturnRow[]>([]);
  const [warranties, setWarranties] = useState<WarrantyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [choice, setChoice] = useState<Choice>();
  const requestSequence = useRef(0);
  const load = useCallback(async (): Promise<boolean> => {
    const current = ++requestSequence.current;
    setLoading(true); setError(undefined);
    try {
      const [r, t, w] = await Promise.all([
        refundRead ? api.platformRefundRequests() : Promise.resolve([]),
        returnRead ? api.platformReturns() : Promise.resolve([]),
        warrantyRead ? api.platformWarranties() : Promise.resolve([]),
      ]);
      if (current !== requestSequence.current) return false;
      setRefunds(r); setReturns(t); setWarranties(w);
      return true;
    } catch (cause) {
      if (current === requestSequence.current) {
        setRefunds([]); setReturns([]); setWarranties([]);
        setError(cause instanceof Error ? cause.message : "Could not load after-sales operations.");
      }
      return false;
    } finally { if (current === requestSequence.current) setLoading(false); }
  }, [refundRead, returnRead, warrantyRead]);
  useEffect(() => { void load(); return () => { requestSequence.current += 1; }; }, [load]);
  async function run(id: string, action: () => Promise<unknown>, success: string) {
    if (busy) return;
    setBusy(id); setError(undefined); setNotice(undefined);
    try { await action(); setChoice(undefined); if (await load()) setNotice(success); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not perform this action."); }
    finally { setBusy(undefined); }
  }
  const actionButton = (title: string, id: string, callback: () => Promise<unknown>, danger = false) =>
    <Button type="button" variant={danger ? "destructive" : "outline"} disabled={Boolean(busy)} onClick={() => void run(id, callback, "Action completed. Current server status refreshed.")}>{title}</Button>;

  return <div className="mt-7 space-y-6">
    {error && <ErrorState detail={error} retry={() => void load()} />}
    {notice && <Alert tone="success">{notice}</Alert>}
    {loading ? <Skeleton className="h-56" /> : <>
      {refundRead && <Card><SectionHeader title="Refund requests" description="Approve only customer-owned refund requests. Provider execution remains an explicit, evidence-led action."/>
        {!refunds.length ? <div className="mt-4"><EmptyState title="No refund requests" detail="Requests from customers appear here."/></div> :
        <div className="mt-4 space-y-3">{refunds.map(refund => <div className="border-b border-border pb-4" key={refund.id}>
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">Request {refund.id.slice(0, 8)}</span><StatusBadge>{refund.status}</StatusBadge></div>
          <p className="mt-1 text-sm text-foreground-muted">Requested amount: {refund.requestedAmount ?? "—"} · Provider: {refund.refund?.status ?? "Not initiated"}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {["REQUESTED", "UNDER_REVIEW"].includes(refund.status) && can("platform.refunds.review") && <>
              {actionButton("Approve refund", refund.id, () => api.refundAction(refund.id, "approve"))}
              {actionButton("Reject refund", refund.id, () => api.refundAction(refund.id, "reject"), true)}
            </>}
            {refund.status === "APPROVED" && refund.refund?.status === "CREATED" && can("platform.refunds.execute") &&
              <Button type="button" variant="destructive" disabled={Boolean(busy)} onClick={() => {
                if (window.confirm("Submit this approved refund to Paystack? This may move real money."))
                  void run(refund.id, () => api.executePlatformRefund(refund.refund!.id), "Refund execution submitted. Verify provider status.");
              }}>Execute provider refund</Button>}
            {refund.refund && ["UNKNOWN", "PENDING"].includes(refund.refund.status) && can("platform.refunds.reconcile") &&
              actionButton("Reconcile provider evidence", refund.id, () => api.reconcilePlatformRefund(refund.refund!.id))}
          </div>
        </div>)}</div>}
      </Card>}
      {returnRead && <Card><SectionHeader title="Returns" description="The platform owns operational return transitions. Receipt and completion do not automatically restock items."/>
        {!returns.length ? <div className="mt-4"><EmptyState title="No returns" detail="Return requests from delivered orders appear here."/></div> :
        <div className="mt-4 space-y-3">{returns.map(row => <div className="border-b border-border pb-4" key={row.id}>
          <div className="flex items-center justify-between gap-2"><span className="font-semibold">Return {row.id.slice(0, 8)}</span><StatusBadge>{row.status}</StatusBadge></div>
          {can("platform.returns.manage") && <div className="mt-3 flex flex-wrap gap-2">
            {row.status === "REQUESTED" && <>{actionButton("Approve return", row.id, () => api.returnAction(row.id, "approve"))}{actionButton("Reject return", row.id, () => api.returnAction(row.id, "reject"), true)}</>}
            {row.status === "APPROVED" && actionButton("Await item", row.id, () => api.returnAction(row.id, "awaiting-item"))}
            {row.status === "AWAITING_ITEM" && actionButton("Mark item received", row.id, () => api.returnAction(row.id, "item-received"))}
            {row.status === "ITEM_RECEIVED" && actionButton("Begin inspection", row.id, () => api.returnAction(row.id, "inspect"))}
            {row.status === "INSPECTING" && <Button variant="outline" onClick={() => setChoice({ id: row.id, resolution: "REFUND", note: "" })}>Complete return</Button>}
          </div>}
          {choice?.id === row.id && can("platform.returns.manage") && <form className="mt-4 grid gap-3 sm:grid-cols-3" onSubmit={event => { event.preventDefault(); void run(row.id, () => api.returnAction(row.id, "complete", { resolution: choice.resolution, inspectionNote: choice.note }), "Return completed through canonical lifecycle."); }}>
            <FormField label="Return resolution"><Select value={choice.resolution} onChange={e => setChoice({ ...choice, resolution: e.target.value })}>{returnResolutions.map(value => <option key={value} value={value}>{value}</option>)}</Select></FormField>
            <FormField label="Inspection note"><Input value={choice.note} maxLength={1000} onChange={e => setChoice({ ...choice, note: e.target.value })}/></FormField>
            <div className="flex items-end gap-2"><Button type="submit" disabled={Boolean(busy)}>Confirm completion</Button><Button type="button" variant="outline" onClick={() => setChoice(undefined)}>Cancel</Button></div>
          </form>}
        </div>)}</div>}
      </Card>}
      {warrantyRead && <Card><SectionHeader title="Warranty claims" description="Warranty refund resolutions reuse the canonical RefundsService request path; no direct provider charge occurs here."/>
        {!warranties.length ? <div className="mt-4"><EmptyState title="No warranty claims" detail="Customer warranty claims appear here."/></div> :
        <div className="mt-4 space-y-3">{warranties.map(row => <div key={row.id} className="border-b border-border pb-4">
          <div className="flex items-center justify-between gap-2"><span className="font-semibold">Claim {row.id.slice(0, 8)}</span><StatusBadge>{row.status}</StatusBadge></div>
          {can("platform.warranties.manage") && <div className="mt-3 flex flex-wrap gap-2">
            {row.status === "SUBMITTED" && actionButton("Start review", row.id, () => api.warrantyAction(row.id, "under-review"))}
            {row.status === "UNDER_REVIEW" && <>{actionButton("Approve claim", row.id, () => api.warrantyAction(row.id, "approve"))}{actionButton("Reject claim", row.id, () => api.warrantyAction(row.id, "reject"), true)}</>}
            {row.status === "APPROVED" && actionButton("Begin warranty service", row.id, () => api.warrantyAction(row.id, "in-service"))}
            {row.status === "IN_SERVICE" && <Button variant="outline" onClick={() => setChoice({ id: row.id, resolution: "REPAIR", note: "" })}>Resolve warranty</Button>}
          </div>}
          {choice?.id === row.id && can("platform.warranties.manage") && <form className="mt-4 grid gap-3 sm:grid-cols-3" onSubmit={event => { event.preventDefault(); void run(row.id, () => api.warrantyAction(row.id, "resolve", { resolution: choice.resolution, resolutionNote: choice.note }), "Warranty resolved through canonical lifecycle."); }}>
            <FormField label="Warranty resolution"><Select value={choice.resolution} onChange={e => setChoice({ ...choice, resolution: e.target.value })}>{warrantyResolutions.map(value => <option key={value} value={value}>{value}</option>)}</Select></FormField>
            <FormField label="Resolution note"><Input value={choice.note} maxLength={1000} onChange={e => setChoice({ ...choice, note: e.target.value })}/></FormField>
            <div className="flex items-end gap-2"><Button type="submit" disabled={Boolean(busy)}>Confirm resolution</Button><Button type="button" variant="outline" onClick={() => setChoice(undefined)}>Cancel</Button></div>
          </form>}
        </div>)}</div>}
      </Card>}
    </>}
  </div>;
}
