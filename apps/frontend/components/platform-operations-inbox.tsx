"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type PlatformOutboxPage } from "../lib/api";
import { Button, Card, EmptyState, ErrorState, SectionHeader, Select, Skeleton, StatusBadge } from "./ui";

export function PlatformOperationsInbox() {
  const [status, setStatus] = useState("FAILED");
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<PlatformOutboxPage>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const sequence = useRef(0);

  const reload = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true); setError(undefined); setResults(undefined);
    try {
      const data = await api.platformOutboxPage({ ...(status ? { status } : {}), page, limit: 25 });
      if (current === sequence.current) setResults(data);
    } catch (cause) {
      if (current === sequence.current) setError(cause instanceof Error ? cause.message : "Could not load background operations.");
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }, [page, status]);
  useEffect(() => { void reload(); return () => { sequence.current += 1; }; }, [reload]);

  return <Card>
    <SectionHeader title="Background job history" description="Safe operational metadata only. Source events, customer details and private payloads are not available here." actions={<Button type="button" variant="outline" disabled={loading} onClick={() => void reload()}>Refresh</Button>}/>
    <div className="mt-5 max-w-xs">
      <label className="text-sm font-semibold">Processing status
        <Select className="mt-2" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>
          <option value="FAILED">Failed</option>
          <option value="PROCESSING">Processing</option>
          <option value="PENDING">Pending</option>
          <option value="PROCESSED">Processed</option>
          <option value="">All statuses</option>
        </Select>
      </label>
    </div>
    {loading ? <Skeleton className="mt-5 h-40" /> : error ? <div className="mt-5"><ErrorState detail={error} retry={() => void reload()} /></div> :
      !results?.items.length ? <div className="mt-5"><EmptyState title="No matching background jobs" detail="Try a different status or refresh." /></div> :
      <div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-border"><tr>
        <th className="p-2">Event</th><th className="p-2">State</th><th className="p-2">Attempts</th><th className="p-2">Last error</th><th className="p-2">Created</th>
      </tr></thead><tbody>{results.items.map(item => <tr key={item.id} className="border-b border-border">
        <td className="p-2"><strong className="block">{item.eventType}</strong><span className="text-xs text-foreground-muted">{item.aggregateType} · {item.id.slice(0, 8)}</span></td>
        <td className="p-2"><StatusBadge>{item.status}</StatusBadge></td>
        <td className="p-2 tabular-nums">{item.attemptCount}</td>
        <td className="p-2">{item.lastErrorCode || "—"}</td>
        <td className="p-2">{new Date(item.createdAt).toLocaleString()}</td>
      </tr>)}</tbody></table></div>}
    {results && <div className="mt-5 flex items-center justify-between gap-3">
      <span className="text-sm text-foreground-muted">Page {results.page} · {results.total} jobs</span>
      <div className="flex gap-2"><Button type="button" variant="outline" disabled={loading || page <= 1} onClick={() => setPage(n => n - 1)}>Previous</Button><Button type="button" variant="outline" disabled={loading || page * results.limit >= results.total} onClick={() => setPage(n => n + 1)}>Next</Button></div>
    </div>}
    <p className="mt-5 text-xs text-foreground-muted">Claims are recovered by the fenced outbox worker. This page cannot trigger arbitrary retries or financial transitions.</p>
  </Card>;
}
