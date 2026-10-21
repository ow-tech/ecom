"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { EmptyState, ErrorState, PageHeader, Skeleton, StatusBadge, StorefrontContainer, Surface } from "../../../components/ui";
import { api, type CustomerSupportTicket } from "../../../lib/api";

export default function SupportPage() {
  const [tickets, setTickets] = useState<CustomerSupportTicket[]>(); const [error, setError] = useState<string>();
  const load = useCallback(async () => { setError(undefined); try { setTickets(await api.supportTickets()); } catch (cause) { setError(cause instanceof Error ? cause.message : "We could not load your support tickets."); } }, []);
  useEffect(() => { void load(); }, [load]);
  return <><StorefrontContainer className="max-w-5xl"><PageHeader eyebrow="Customer account" title="Support" description="View your support requests and replies." actions={<Link className="inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-white" href="/account/support/new">New request</Link>} />{error ? <div className="mt-7"><ErrorState detail={error} retry={() => void load()} /></div> : !tickets ? <div className="mt-7"><Skeleton className="h-28" /></div> : !tickets.length ? <div className="mt-7"><EmptyState title="No support requests" detail="Create a request when you need help with an order or account." action={<Link className="font-semibold text-secondary hover:underline" href="/account/support/new">Contact support</Link>} /></div> : <div className="mt-7 space-y-3">{tickets.map(ticket => <Surface key={ticket.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold">{ticket.subject}</p><p className="mt-1 text-sm text-foreground-muted">{ticket.ticketNumber} · Last activity {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(ticket.updatedAt))}</p><div className="mt-3 flex gap-2"><StatusBadge>{ticket.status.replaceAll("_", " ")}</StatusBadge><StatusBadge tone="info">{ticket.category}</StatusBadge></div></div><Link className="text-sm font-semibold text-secondary hover:underline" href={`/account/support/${ticket.id}`}>View ticket</Link></Surface>)}</div>}</StorefrontContainer></>;
}
