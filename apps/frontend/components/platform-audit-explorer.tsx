"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type PlatformAuditPage } from "../lib/api";
import { Button, Card, EmptyState, ErrorState, FormField, Input, SectionHeader, Skeleton, StatusBadge } from "./ui";

export function PlatformAuditExplorer() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ action: "", entityType: "", actor: "" });
  const [applied, setApplied] = useState(filters);
  const [result, setResult] = useState<PlatformAuditPage>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const load = useCallback(async () => {
    setLoading(true); setError(undefined);
    try { setResult(await api.platformAudit({ ...applied, page, limit: 25 })); }
    catch (cause) { setResult(undefined); setError(cause instanceof Error ? cause.message : "Audit history unavailable."); }
    finally { setLoading(false); }
  }, [page, applied]);
  useEffect(() => { void load(); }, [load]);
  return <Card className="mt-7">
    <SectionHeader title="Platform audit trail" description="Server-recorded actions only. Sensitive metadata is sanitized by the audit service." actions={<Button type="button" variant="outline" disabled={loading} onClick={() => void load()}>Refresh audit</Button>}/>
    <form className="mt-5 grid gap-3 sm:grid-cols-4" onSubmit={event => { event.preventDefault(); setApplied({ ...filters }); setPage(1); }}>
      <FormField label="Action"><Input value={filters.action} onChange={e => setFilters(f => ({ ...f, action: e.target.value }))} placeholder="PRODUCT_UPDATED"/></FormField>
      <FormField label="Entity type"><Input value={filters.entityType} onChange={e => setFilters(f => ({ ...f, entityType: e.target.value }))} placeholder="PRODUCT"/></FormField>
      <FormField label="Actor user ID"><Input value={filters.actor} onChange={e => setFilters(f => ({ ...f, actor: e.target.value }))} placeholder="Optional actor"/></FormField>
      <div className="flex items-end"><Button type="submit">Filter audit</Button></div>
    </form>
    {loading ? <Skeleton className="mt-5 h-48"/> : error ? <div className="mt-5"><ErrorState detail={error} retry={() => void load()}/></div> :
      !result?.items.length ? <div className="mt-5"><EmptyState title="No audit events" detail="Try clearing the filters."/></div> :
      <div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm">
        <thead><tr className="border-b border-border"><th className="p-2">When</th><th className="p-2">Action</th><th className="p-2">Entity</th><th className="p-2">Actor</th></tr></thead>
        <tbody>{result.items.map(event => <tr className="border-b border-border" key={event.id}>
          <td className="p-2">{new Date(event.createdAt).toLocaleString()}</td>
          <td className="p-2"><StatusBadge>{event.action}</StatusBadge></td>
          <td className="p-2">{event.entityType} · {event.entityId?.slice(0, 8) ?? "—"}</td>
          <td className="p-2">{event.actorUserId?.slice(0, 8) ?? event.actorType}</td>
        </tr>)}</tbody></table></div>}
    {result && <div className="mt-5 flex items-center justify-between gap-3">
      <span className="text-sm text-foreground-muted">Page {result.page} · {result.total} matching events</span>
      <div className="flex gap-2"><Button variant="outline" type="button" disabled={loading || page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Previous</Button>
      <Button variant="outline" type="button" disabled={loading || page * result.limit >= result.total} onClick={() => setPage(p => p + 1)}>Next</Button></div>
    </div>}
  </Card>;
}
