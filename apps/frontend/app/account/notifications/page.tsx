"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type AccountNotificationsPage, type AccountNotificationPreference } from "../../../lib/api";
import { useSession } from "../../../components/session-provider";
import { loginHref } from "../../../lib/auth-routing";
import { Alert, Button, EmptyState, ErrorState, PageHeader, Skeleton, StatusBadge, StorefrontContainer, Surface } from "../../../components/ui";

const categories = ["ORDER", "PAYMENT", "DELIVERY", "REFUND", "RETURN", "WARRANTY", "SUPPORT", "SUPPLIER", "FINANCE"];
const label = (value: string) => value.toLowerCase().replace(/(^|\s)\w/g, ch => ch.toUpperCase());

export default function AccountNotificationsPage() {
  const router = useRouter();
  const { session, loading: sessionLoading } = useSession();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AccountNotificationsPage>();
  const [preferences, setPreferences] = useState<AccountNotificationPreference[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [savingCategory, setSavingCategory] = useState<string>();
  const requestSequence = useRef(0);

  const refresh = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setLoading(true); setError(undefined);
    try {
      const [result, prefs, unreadCount] = await Promise.all([
        api.accountNotifications(page), api.accountNotificationPreferences(), api.unreadNotificationCount(),
      ]);
      if (sequence !== requestSequence.current) return;
      setData(result); setPreferences(prefs); setUnread(unreadCount.count);
    } catch (cause) {
      if (sequence !== requestSequence.current) return;
      setData(undefined); setError(cause instanceof Error ? cause.message : "Could not load notifications.");
    } finally { if (sequence === requestSequence.current) setLoading(false); }
  }, [page]);

  useEffect(() => {
    if (!sessionLoading && !session) router.replace(loginHref("/account/notifications"));
  }, [sessionLoading, session, router]);
  useEffect(() => {
    if (session) void refresh();
    return () => { requestSequence.current += 1; };
  }, [session, refresh]);

  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true); setActionError(undefined);
    try { await action(); await refresh(); }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : "Action failed. Please retry."); }
    finally { setBusy(false); }
  }
  async function toggle(category: string) {
    if (savingCategory) return;
    const current = preferences.find(item => item.category === category)?.inAppEnabled ?? true;
    setSavingCategory(category); setActionError(undefined);
    try {
      await api.updateNotificationPreferences([{ category, inAppEnabled: !current }]);
      await refresh();
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : "Could not update notification preferences."); }
    finally { setSavingCategory(undefined); }
  }
  if (!sessionLoading && !session) return null;
  return <><StorefrontContainer className="max-w-4xl">
    <PageHeader eyebrow="Your account" title="Notifications" description="Order, payment, delivery and support updates from your Ecom account." actions={<Link href="/account" className="font-semibold text-secondary hover:underline">Back to account</Link>} />
    {actionError && <div className="mt-5"><Alert tone="error">{actionError}</Alert></div>}
    {sessionLoading || !session || (loading && !data) ? <Skeleton className="mt-7 h-56" /> : error ? <div className="mt-7"><ErrorState detail={error} retry={() => void refresh()} /></div> :
    <>
      <Surface className="mt-7"><div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-semibold">{unread} unread notification{unread === 1 ? "" : "s"}</span>
        <div className="flex gap-2"><Button type="button" variant="outline" disabled={loading || busy} onClick={() => void refresh()}>Refresh</Button><Button type="button" disabled={busy || unread === 0} onClick={() => void run(() => api.markAllNotificationsRead())}>Mark all read</Button></div>
      </div>
      {!data?.items.length ? <div className="mt-6"><EmptyState title="No notifications" detail="New order and account updates will appear here." /></div> :
      <ul className="mt-5 space-y-3">{data.items.map(item => <li key={item.id} className="rounded-lg border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><strong>{item.title}</strong><StatusBadge>{item.readAt ? "Read" : "Unread"}</StatusBadge></div>
        <p className="mt-2 whitespace-pre-wrap text-sm text-foreground-muted">{item.body}</p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-foreground-muted">{item.category} · {new Date(item.createdAt).toLocaleString()}</span>
          {!item.readAt && <Button type="button" variant="outline" disabled={busy} onClick={() => void run(() => api.markNotificationRead(item.id))}>Mark read</Button>}
        </div>
      </li>)}</ul>}
      {data && <div className="mt-5 flex items-center justify-between gap-3"><span className="text-xs text-foreground-muted">Page {data.page} · {data.total} total</span><div className="flex gap-2"><Button type="button" variant="outline" disabled={loading || page <= 1} onClick={() => setPage(n => n - 1)}>Previous</Button><Button type="button" variant="outline" disabled={loading || page * data.limit >= data.total} onClick={() => setPage(n => n + 1)}>Next</Button></div></div>}
      </Surface>
      <Surface className="mt-6"><h2 className="text-lg font-bold">In-app preferences</h2>
        <p className="mt-2 text-sm text-foreground-muted">Turn off optional updates by category. Required payment and security notices remain available. Email and SMS delivery are not enabled yet.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">{categories.map(category => {
          const enabled = preferences.find(item => item.category === category)?.inAppEnabled ?? true;
          return <label key={category} className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm font-semibold">
            <input aria-label={`${label(category)} in-app notifications`} type="checkbox" checked={enabled}
              disabled={savingCategory !== undefined || busy} onChange={() => void toggle(category)}/>
            {label(category)}
          </label>;
        })}</div>
      </Surface>
    </>}
  </StorefrontContainer></>;
}
