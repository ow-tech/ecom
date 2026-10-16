"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useCart } from "../../../../components/cart-provider";
import { useSession } from "../../../../components/session-provider";
import { loginHref } from "../../../../lib/auth-routing";
import { paymentStateLabel, usePaymentConfirmation } from "../../../../components/payment-confirmation";
import { StorefrontHeader } from "../../../../components/storefront-header";
import type { CustomerOrder, CustomerTracking, PaymentAttempt } from "../../../../lib/api";
import { payments } from "../../../../lib/payments";
import { customerPaymentState } from "../../../../lib/payment-state";
import { Alert, Button, ErrorState, Money, OrderSummary, PageHeader, Skeleton, StatusBadge, StorefrontContainer, Surface } from "../../../../components/ui";
import { OrderTrackingTimeline } from "../../../../components/order-tracking-timeline";

type Loaded = { order: CustomerOrder; payment: PaymentAttempt | null; tracking: CustomerTracking };

export default function PaymentPage() { return <Suspense><PaymentPageContent /></Suspense>; }

function PaymentPageContent() {
  const { orderId } = useParams<{ orderId: string }>(); const search = useSearchParams(); const router = useRouter(); const { session, loading: sessionLoading } = useSession(); const { refresh } = useCart();
  const [loaded, setLoaded] = useState<Loaded>(); const [error, setError] = useState<string>(); const [initializing, setInitializing] = useState(false); const resultRef = useRef<HTMLDivElement>(null);
  const returned = Boolean(search.get("paymentId") || search.get("reference"));
  const load = useCallback(async () => { setError(undefined); try { const [order, status, tracking] = await Promise.all([payments.getOrder(orderId), payments.getPaymentStatus(orderId), payments.getTracking(orderId)]); setLoaded({ order, payment: status.payment, tracking }); } catch (cause) { setError(cause instanceof Error ? cause.message : "We could not load this order."); } }, [orderId]);
  useEffect(() => { if (!sessionLoading && !session) router.replace(loginHref(`/checkout/payment/${orderId}`)); }, [router, session, sessionLoading, orderId]);
  useEffect(() => { if (session) void load(); }, [load, session]);
  if (sessionLoading) return <><StorefrontHeader /><StorefrontContainer className="max-w-5xl"><Skeleton className="h-10 w-64" /></StorefrontContainer></>;
  if (!session) return null;
  if (error) return <><StorefrontHeader /><StorefrontContainer className="max-w-3xl"><ErrorState detail={error} retry={() => void load()} /></StorefrontContainer></>;
  if (!loaded) return <><StorefrontHeader /><StorefrontContainer className="max-w-5xl"><Skeleton className="h-10 w-64" /></StorefrontContainer></>;
  return <PaymentExperience initial={loaded} orderId={orderId} returned={returned} initializing={initializing} setInitializing={setInitializing} refreshCart={refresh} resultRef={resultRef} />;
}

function PaymentExperience({ initial, orderId, returned, initializing, setInitializing, refreshCart, resultRef }: { initial: Loaded; orderId: string; returned: boolean; initializing: boolean; setInitializing: (value: boolean) => void; refreshCart: () => Promise<void>; resultRef: RefObject<HTMLDivElement | null> }) {
  const { snapshot, state, checking, timedOut, temporaryError, checkAgain } = usePaymentConfirmation(orderId, initial, returned);
  const order = { ...initial.order, ...snapshot.order }; const payment = snapshot.payment;
  useEffect(() => { if (["PAID", "FAILED", "PAYMENT_REVIEW", "EXPIRED", "CANCELLED"].includes(state)) { void refreshCart(); resultRef.current?.focus(); } }, [refreshCart, resultRef, state]);
  const startPayment = async () => {
    setInitializing(true);
    try {
      const initialized = await payments.initializePayment(orderId, crypto.randomUUID(), "CARD");
      if (initialized.authorizationUrl) window.location.assign(initialized.authorizationUrl);
      else window.location.reload();
    } catch { resultRef.current?.focus(); }
    finally { setInitializing(false); }
  };
  const summary = <OrderSummary title="Order summary" lines={order.items.map(item => ({ label: `${item.productNameSnapshot}${item.variantNameSnapshot ? ` · ${item.variantNameSnapshot}` : ""} × ${item.quantity}`, value: item.lineTotal, currency: item.currencyCode }))} subtotal={{ value: order.total, currency: order.currencyCode }} totalLabel="Total" note={`Order ${order.orderNumber} · ${order.fulfillmentMethod === "PICKUP" ? "Pickup" : "Delivery"}`} />;
  const tone = state === "PAID" ? "success" : state === "PAYMENT_REVIEW" || state === "AWAITING_DELIVERY_QUOTE" || state === "UNKNOWN" || state === "PENDING_CONFIRMATION" ? "warning" : state === "FAILED" || state === "EXPIRED" || state === "CANCELLED" ? "danger" : "info";
  return <><StorefrontHeader /><StorefrontContainer className="grid max-w-5xl gap-8 lg:grid-cols-[1fr_20rem]"><section><PageHeader eyebrow="Order payment" title={state === "PENDING_CONFIRMATION" || (returned && !["PAID", "PAYMENT_REVIEW"].includes(state)) ? "Confirming your payment" : paymentStateLabel(state)} description={`Order ${order.orderNumber} · created ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(order.createdAt))}`} /><Surface className="mt-6" ><div ref={resultRef} tabIndex={-1} className="outline-none"><StatusBadge tone={tone}>{paymentStateLabel(state)}</StatusBadge><div className="mt-4"><PaymentMessage state={state} timedOut={timedOut} temporaryError={temporaryError} /></div>{(checking || initializing) && <p className="mt-4 text-sm text-foreground-muted" role="status" aria-live="polite">{initializing ? "Starting secure payment…" : "Checking the latest payment status…"}</p>}<PaymentActions state={state} initializing={initializing} checking={checking} startPayment={startPayment} checkAgain={checkAgain} /></div></Surface><Surface className="mt-5"><h2 className="text-lg font-bold">Order details</h2><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-foreground-muted">Order status</dt><dd className="mt-1 font-semibold">{order.status.replaceAll("_", " ")}</dd></div><div><dt className="text-foreground-muted">Payment status</dt><dd className="mt-1 font-semibold">{order.paymentStatus.replaceAll("_", " ")}</dd></div><div><dt className="text-foreground-muted">Total</dt><dd className="mt-1"><Money value={order.total} currency={order.currencyCode} /></dd></div><div><dt className="text-foreground-muted">Fulfilment</dt><dd className="mt-1 font-semibold">{order.fulfillmentMethod === "PICKUP" ? "Pickup" : "Delivery"}</dd></div></dl><div className="mt-5 border-t border-border pt-4"><h3 className="font-bold">Items</h3><div className="mt-3 space-y-3">{order.items.map(item => <div className="flex justify-between gap-3 text-sm" key={item.id}><span>{item.productNameSnapshot}{item.variantNameSnapshot ? ` · ${item.variantNameSnapshot}` : ""} × {item.quantity}<span className="block text-foreground-muted">{item.supplierNameSnapshot}{item.supplierSkuSnapshot ? ` · ${item.supplierSkuSnapshot}` : ""}</span></span><Money value={item.lineTotal} currency={item.currencyCode} /></div>)}</div></div><dl className="mt-5 grid gap-3 border-t border-border pt-4 text-sm sm:grid-cols-2"><div><dt className="text-foreground-muted">Items subtotal</dt><dd><Money value={order.subtotal} currency={order.currencyCode} /></dd></div><div><dt className="text-foreground-muted">Delivery fee</dt><dd><Money value={order.deliveryFee} currency={order.currencyCode} /></dd></div><div><dt className="text-foreground-muted">Pickup fee</dt><dd><Money value={order.pickupFee} currency={order.currencyCode} /></dd></div><div><dt className="text-foreground-muted">Grand total</dt><dd><Money value={order.total} currency={order.currencyCode} /></dd></div></dl></Surface><OrderTrackingTimeline tracking={initial.tracking} /><div className="mt-5"><Link className="text-sm font-semibold text-secondary hover:underline" href={`/account/support/new?orderId=${encodeURIComponent(orderId)}`}>Get help with this order</Link>{order.status === "DELIVERED" && <Link className="ml-4 text-sm font-semibold text-secondary hover:underline" href={`/account/orders/${encodeURIComponent(orderId)}/after-sales`}>Returns, refunds & warranties</Link>}</div></section><aside>{summary}</aside></StorefrontContainer></>;
}

function PaymentMessage({ state, timedOut, temporaryError }: { state: ReturnType<typeof customerPaymentState>; timedOut: boolean; temporaryError?: string }) {
  if (state === "PAID") return <Alert tone="success">Your payment has been confirmed. We will now prepare your order for fulfilment.</Alert>;
  if (state === "PAYMENT_REVIEW") return <Alert tone="warning">Payment has been received, but this order requires review before fulfilment can continue.</Alert>;
  if (state === "AWAITING_DELIVERY_QUOTE") return <Alert tone="info">A delivery quote must be approved before this order can be paid.</Alert>;
  if (state === "EXPIRED") return <Alert tone="error">This order expired and its reservation is no longer available.</Alert>;
  if (state === "CANCELLED") return <Alert tone="error">This order was cancelled and cannot be paid.</Alert>;
  if (state === "FAILED") return <Alert tone="error">The payment was not completed. You may try a new payment attempt.</Alert>;
  if (timedOut) return <Alert tone="info">Payment confirmation is taking longer than expected. Your order will update when the backend receives authoritative confirmation.</Alert>;
  if (temporaryError) return <Alert tone="info">{temporaryError} This does not mean the payment failed.</Alert>;
  return <Alert tone="info">We are waiting for authoritative confirmation from the payment provider. Do not pay again while this is being checked.</Alert>;
}

function PaymentActions({ state, initializing, checking, startPayment, checkAgain }: { state: ReturnType<typeof customerPaymentState>; initializing: boolean; checking: boolean; startPayment: () => Promise<void>; checkAgain: () => Promise<void> }) {
  if (state === "PAYABLE" || state === "FAILED") return <div className="mt-5"><Button loading={initializing} onClick={() => void startPayment()}>{state === "FAILED" ? "Try payment again" : "Pay securely"}</Button></div>;
  if (state === "PENDING_CONFIRMATION" || state === "UNKNOWN") return <div className="mt-5 flex flex-wrap gap-3"><Button variant="outline" loading={checking} onClick={() => void checkAgain()}>Check again</Button><Link className="inline-flex min-h-10 items-center justify-center px-2 text-sm font-semibold text-secondary hover:underline" href="/account/orders">View order</Link></div>;
  if (state === "EXPIRED" || state === "CANCELLED") return <div className="mt-5 flex gap-3"><Link className="inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-white" href="/cart">Return to cart</Link><Link className="inline-flex min-h-10 items-center justify-center px-2 text-sm font-semibold text-secondary hover:underline" href="/products">Browse products</Link></div>;
  return <div className="mt-5"><Link className="text-sm font-semibold text-secondary hover:underline" href="/account/orders">View all orders</Link></div>;
}
