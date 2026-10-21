"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "../../../components/session-provider";
import { loginHref } from "../../../lib/auth-routing";
import type { CustomerOrderListItem } from "../../../lib/api";
import { payments } from "../../../lib/payments";
import { EmptyState, ErrorState, Money, PageHeader, Skeleton, StatusBadge, StorefrontContainer, Surface } from "../../../components/ui";

export default function OrdersPage() {
  const { session, loading: sessionLoading } = useSession(); const router = useRouter(); const [orders, setOrders] = useState<CustomerOrderListItem[]>(); const [error, setError] = useState<string>();
  const load = useCallback(async () => { setError(undefined); try { setOrders(await payments.getOrders()); } catch (cause) { setError(cause instanceof Error ? cause.message : "We could not load your orders."); } }, []);
  useEffect(() => { if (!sessionLoading && !session) router.replace(loginHref("/account/orders")); }, [router, session, sessionLoading]); useEffect(() => { if (session) void load(); }, [load, session]);
  if (sessionLoading || !orders && !error) return <><StorefrontContainer><Skeleton className="h-10 w-48" /></StorefrontContainer></>;
  if (!session) return null;
  return <><StorefrontContainer className="max-w-5xl"><PageHeader eyebrow="Customer account" title="Your orders" description="Payment and fulfilment are shown from the latest server state." actions={<Link className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border px-4 text-sm font-semibold hover:bg-muted" href="/account/support">Support</Link>} />{error ? <div className="mt-7"><ErrorState detail={error} retry={() => void load()} /></div> : !orders?.length ? <div className="mt-7"><EmptyState title="No orders yet" detail="Orders created from checkout will appear here." action={<Link className="font-semibold text-secondary hover:underline" href="/products">Browse products</Link>} /></div> : <div className="mt-7 space-y-3">{orders.map(order => <Surface key={order.id} className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold">{order.orderNumber}</p><p className="mt-1 text-sm text-foreground-muted">{new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(order.createdAt))} · <Money value={order.total} currency={order.currencyCode} /></p><p className="mt-2 text-sm text-foreground-muted">{order.fulfillmentMethod === "PICKUP" ? "Pickup" : "Delivery"} · {order.items.map(item => `${item.productNameSnapshot}${item.variantNameSnapshot ? ` · ${item.variantNameSnapshot}` : ""} × ${item.quantity}`).join(", ")}</p><div className="mt-3 flex flex-wrap gap-2">{order.items.some(item => item.originSnapshot === "OVERSEAS") && <StatusBadge>Ships from overseas</StatusBadge>}<StatusBadge tone={order.paymentStatus === "PAID" ? "success" : order.paymentStatus === "PAID_REVIEW" ? "warning" : "info"}>{order.paymentStatus.replaceAll("_", " ")}</StatusBadge><StatusBadge>{order.status.replaceAll("_", " ")}</StatusBadge></div></div><Link className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border px-4 text-sm font-semibold hover:bg-muted" href={`/checkout/payment/${order.id}`}>View order</Link>{order.status === "DELIVERED" && <Link className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border px-4 text-sm font-semibold hover:bg-muted" href={`/account/orders/${order.id}/after-sales`}>After-sales</Link>}</Surface>)}</div>}</StorefrontContainer></>;
}
