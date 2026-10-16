"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type SupplierReport } from "../lib/api";
import { Button, Card, EmptyState, ErrorState, Money, PageHeader, SectionHeader, Skeleton, StatusBadge } from "./ui";

export function SupplierReports({ organizationId }: { organizationId: string }) {
  const [report, setReport] = useState<SupplierReport>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setError(undefined); setReport(undefined);
    try { setReport(await api.supplierReport(organizationId)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load supplier reporting."); }
    finally { setLoading(false); }
  }, [organizationId]);
  useEffect(() => { void load(); }, [load]);
  return <>
    <PageHeader eyebrow="Supplier workspace" title="Reports" description="Server-derived supplier activity. Financial values are displayed only for users with finance permission." />
    <div className="mt-6 flex items-center justify-between">
      <p className="text-sm text-foreground-muted">{report?.period.label ?? "Last 30 days"}</p>
      <Button type="button" variant="outline" disabled={loading} onClick={() => void load()}>Refresh report</Button>
    </div>
    {loading ? <Skeleton className="mt-5 h-52"/> : error ? <div className="mt-5"><ErrorState detail={error} retry={() => void load()} /></div> : report && <>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{([
        ["Active listings", report.overview.activeListings],
        ["Stock attention", report.overview.stockAttention],
        ["Preparing orders", report.overview.preparing],
        ["Ready for handover", report.overview.ready],
      ] as const).filter(([, value]) => value !== null).map(([name, value]) =>
        <Card key={name}><p className="text-xs font-bold uppercase text-foreground-muted">{name}</p><p className="mt-2 text-3xl font-bold tabular-nums">{value}</p></Card>)}</div>
      {report.orderStatuses && <Card className="mt-6"><SectionHeader title="Supplier order status" description="Counts for supplier orders created during the last 30 days."/>
        {!report.orderStatuses.length ? <div className="mt-4"><EmptyState title="No recent orders" detail="New supplier orders will appear here." /></div>
        : <div className="mt-4 space-y-3">{report.orderStatuses.map(item => <div key={item.status} className="flex items-center justify-between border-b border-border pb-2"><StatusBadge>{item.status.replaceAll("_", " ")}</StatusBadge><span className="font-semibold tabular-nums">{item.count}</span></div>)}</div>}
      </Card>}
      {report.paidMerchandise && <Card className="mt-6"><SectionHeader title="Gross paid merchandise" description="Paid supplier-order subtotals by currency, before commissions, returns and refunds. Not supplier earnings or payout liability."/>
        {!report.paidMerchandise.length ? <div className="mt-4"><EmptyState title="No paid merchandise yet" detail="Paid supplier orders will appear here." /></div>
        : <div className="mt-4 space-y-3">{report.paidMerchandise.map(item => <div key={item.currencyCode} className="flex flex-wrap items-center justify-between border-b border-border pb-3"><span className="text-sm">{item.paidSupplierOrders} paid supplier orders · {item.currencyCode}</span><strong><Money value={item.subtotal} currency={item.currencyCode}/></strong></div>)}</div>}
      </Card>}
    </>}
  </>;
}
