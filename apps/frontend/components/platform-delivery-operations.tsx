"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type DeliveryOperationsPage } from "../lib/api";
import { Button, Card, EmptyState, ErrorState, Money, SectionHeader, Select, Skeleton, StatusBadge } from "./ui";

export function DeliveryOperations() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [method, setMethod] = useState("");
  const [result, setResult] = useState<DeliveryOperationsPage>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const requestSequence = useRef(0);
  const reload = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setLoading(true); setError(undefined); setResult(undefined);
    try {
      const response = await api.platformDeliveryOperations({ page, limit: 25, ...(status ? { status } : {}), ...(method ? { fulfillmentMethod: method } : {}) });
      if (sequence === requestSequence.current) setResult(response);
    } catch (cause) {
      if (sequence === requestSequence.current) { setResult(undefined); setError(cause instanceof Error ? cause.message : "Could not load delivery operations."); }
    } finally { if (sequence === requestSequence.current) setLoading(false); }
  }, [page, status, method]);
  useEffect(() => { void reload(); return () => { requestSequence.current += 1; }; }, [reload]);

  return <Card>
    <SectionHeader title="Delivery and pickup operations" description="Server-confirmed paid order progress. Supplier staff complete fulfilment in their own workspaces." actions={<Button type="button" variant="outline" disabled={loading} onClick={() => void reload()}>Refresh</Button>} />
    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-semibold">Fulfilment method
        <Select value={method} onChange={e => { setMethod(e.target.value); setPage(1); }} className="mt-1">
          <option value="">All methods</option><option value="DELIVERY">Delivery</option><option value="PICKUP">Pickup</option>
        </Select>
      </label>
      <label className="text-sm font-semibold">Order status
        <Select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="mt-1">
          <option value="">All active paid orders</option>
          <option value="PAYMENT_CONFIRMED">Payment confirmed</option>
          <option value="PROCESSING">Processing</option>
          <option value="READY_FOR_PICKUP">Ready for pickup</option>
          <option value="OUT_FOR_DELIVERY">Out for delivery</option>
        </Select>
      </label>
    </div>
    {loading ? <Skeleton className="mt-4 h-32" /> : error ? <div className="mt-4"><ErrorState detail={error} retry={() => void reload()} /></div>
    : !result?.data.length ? <div className="mt-4"><EmptyState title="No matching fulfilment work" detail="Try another status or refresh the queue." /></div> :
    <div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-border"><tr>
      <th className="p-2">Order</th><th className="p-2">Destination</th><th className="p-2">Progress by supplier</th><th className="p-2">Total</th>
    </tr></thead><tbody>{result.data.map(order => <tr key={order.id} className="border-b border-border align-top">
      <td className="p-2"><span className="font-semibold">{order.orderNumber}</span><span className="mt-1 block"><StatusBadge>{order.status.replaceAll("_", " ")}</StatusBadge></span></td>
      <td className="p-2">{order.fulfillmentMethod === "PICKUP" ? `Pickup: ${order.pickupSnapshot?.name ?? "Unspecified"} · ${order.pickupSnapshot?.city ?? ""}` : `Delivery: ${order.deliveryAddress?.city ?? "Unspecified"}, ${order.deliveryAddress?.region ?? ""}`}</td>
      <td className="p-2"><ul className="space-y-1">{order.supplierOrders.map(unit => <li key={unit.id}>{unit.supplier.displayName}: {unit.status.replaceAll("_", " ")}</li>)}</ul></td>
      <td className="p-2"><Money value={order.total} currency={order.currencyCode} /></td>
    </tr>)}</tbody></table></div>}
    {result && <div className="mt-5 flex items-center justify-between gap-3">
      <span className="text-sm text-foreground-muted">Page {result.page} · {result.total} matching order(s)</span>
      <div className="flex gap-2">
        <Button type="button" variant="outline" disabled={loading || page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Previous</Button>
        <Button type="button" variant="outline" disabled={loading || page * result.limit >= result.total} onClick={() => setPage(p => p + 1)}>Next</Button>
      </div>
    </div>}
  </Card>;
}
