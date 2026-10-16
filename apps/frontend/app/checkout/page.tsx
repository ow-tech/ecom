"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCart } from "../../components/cart-provider";
import { CustomerAddressForm, addressLines } from "../../components/customer-address";
import { CheckoutPaymentOptions, type CheckoutPaymentMethod } from "../../components/checkout-payment-options";
import { CheckoutPaymentProgress, type CheckoutPaymentIntent } from "../../components/checkout-payment-progress";
import { useSession } from "../../components/session-provider";
import { StorefrontHeader } from "../../components/storefront-header";
import { Alert, Button, EmptyState, Money, OrderSummary, PageHeader, SectionHeader, SelectableCard, Skeleton, StorefrontContainer, Surface } from "../../components/ui";
import { loginHref } from "../../lib/auth-routing";
import { api, type CheckoutPreview, type CustomerAddress, type PaymentInitialization, type PickupPoint } from "../../lib/api";
import { redirectToPaystackHostedCheckout } from "../../lib/paystack-hosted";

type FulfillmentInput = { fulfillmentMethod: "DELIVERY"; addressId: string } | { fulfillmentMethod: "PICKUP"; pickupPointId: string };
const intentStorageKey = "ecom.checkout.payment-intent";

function storedPaymentIntent(): CheckoutPaymentIntent | undefined {
  if (typeof window === "undefined") return undefined;
  const raw = window.sessionStorage.getItem(intentStorageKey);
  if (!raw) return undefined;
  try {
    const value = JSON.parse(raw) as CheckoutPaymentIntent;
    if (value.orderId && value.key && (value.method === "CARD" || value.method === "MPESA")) return value;
  } catch { /* Invalid session state is discarded below. */ }
  window.sessionStorage.removeItem(intentStorageKey);
  return undefined;
}

function sameQuote(left: CheckoutPreview, right: { currencyCode: string; subtotal: string; deliveryFee: string; pickupFee: string; total: string; deliveryQuoteRequired: boolean }) {
  return left.currencyCode === right.currencyCode && left.subtotal === right.subtotal && left.deliveryFee === right.deliveryFee && left.pickupFee === right.pickupFee && left.total === right.total && left.deliveryQuoteRequired === right.deliveryQuoteRequired;
}

export default function CheckoutPage() {
  const router = useRouter(); const { session, loading: sessionLoading } = useSession(); const { cart, loading: cartLoading, refresh } = useCart();
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]); const [points, setPoints] = useState<PickupPoint[]>([]); const [fulfillment, setFulfillment] = useState<"DELIVERY" | "PICKUP">(); const [addressId, setAddressId] = useState<string>(); const [pickupPointId, setPickupPointId] = useState<string>();
  const [paymentMethod, setPaymentMethod] = useState<CheckoutPaymentMethod>("CARD"); const [preview, setPreview] = useState<CheckoutPreview>(); const [previewLoading, setPreviewLoading] = useState(false); const [showAddressForm, setShowAddressForm] = useState(false); const [editingAddressId, setEditingAddressId] = useState<string>(); const [addressRevision, setAddressRevision] = useState(0); const [working, setWorking] = useState(false); const [initializingPayment, setInitializingPayment] = useState(false); const [error, setError] = useState<string>(); const [notice, setNotice] = useState<string>(); const [intent, setIntent] = useState<CheckoutPaymentIntent>(); const [intentLoaded, setIntentLoaded] = useState(false); const [priceConfirmation, setPriceConfirmation] = useState<{ orderId: string; total: string; currencyCode: string; method: CheckoutPaymentMethod }>(); const quoteSequence = useRef(0); const prepareKey = useRef<{ selection: string; key: string } | undefined>(undefined); const operationInFlight = useRef(false);
  const selectedInput = useCallback((): FulfillmentInput | undefined => fulfillment === "DELIVERY" && addressId ? { fulfillmentMethod: "DELIVERY", addressId } : fulfillment === "PICKUP" && pickupPointId ? { fulfillmentMethod: "PICKUP", pickupPointId } : undefined, [fulfillment, addressId, pickupPointId]);
  const cartQuoteKey = cart?.items.map(item => `${item.id}:${item.quantity}:${item.unitPrice}`).join("|");

  useEffect(() => { if (!sessionLoading && !session) router.replace(loginHref("/checkout")); }, [router, session, sessionLoading]);
  useEffect(() => { setIntent(storedPaymentIntent()); setIntentLoaded(true); }, []);
  useEffect(() => { if (!session) return; void api.customerAddresses().then(next => { setAddresses(next); setAddressId(next.find(value => value.isDefault)?.id ?? next[0]?.id); if (next.length) setFulfillment(current => current ?? "DELIVERY"); }).catch(cause => setError(cause instanceof Error ? cause.message : "Could not load checkout.")); }, [session]);
  useEffect(() => { if (fulfillment !== "PICKUP") return; const address = addresses.find(value => value.id === addressId); void api.pickupPoints(address ? { countryCode: address.countryCode, region: address.region, city: address.city } : {}).then(next => { setPoints(next); setPickupPointId(current => current && next.some(value => value.id === current) ? current : next[0]?.id); }).catch(cause => setError(cause instanceof Error ? cause.message : "Could not load pickup points.")); }, [fulfillment, addresses, addressId]);
  useEffect(() => { const selected = selectedInput(); if (!selected || !cart?.items.length) { setPreview(undefined); return; } const sequence = ++quoteSequence.current; setPreviewLoading(true); void api.previewCheckout(selected).then(next => { if (sequence !== quoteSequence.current) return; setPreview(next); setPaymentMethod(current => next.availablePaymentMethods.includes(current) ? current : next.availablePaymentMethods[0] ?? "CARD"); }).catch(cause => { if (sequence === quoteSequence.current) { setPreview(undefined); setError(cause instanceof Error ? cause.message : "Could not calculate this checkout."); } }).finally(() => { if (sequence === quoteSequence.current) setPreviewLoading(false); }); }, [selectedInput, cartQuoteKey, cart?.items.length, addressRevision]);
  const applyAddress = (address: CustomerAddress) => {
    setAddresses(current => [address, ...current.filter(value => value.id !== address.id)].map(value => address.isDefault ? { ...value, isDefault: value.id === address.id } : value));
    setAddressId(address.id); setShowAddressForm(false); setEditingAddressId(undefined); setAddressRevision(value => value + 1); setNotice("Delivery details saved. Your delivery quote has been refreshed.");
  };
  const openPaystack = useCallback(async (initialized: PaymentInitialization) => {
    if (initialized.authorizationUrl) {
      redirectToPaystackHostedCheckout(initialized.authorizationUrl);
      return;
    }
    const message = initialized.failureKind === "CONFIGURATION_REJECTED"
      ? "Secure payments are temporarily unavailable because Paystack rejected the store configuration. No charge was started."
      : initialized.failureKind === "PROVIDER_REJECTED"
        ? "Paystack rejected this checkout initialization. No charge was started; you can try again."
        : initialized.failureKind === "NETWORK_UNCERTAIN"
          ? "The connection to Paystack was interrupted. This attempt is retained while its authoritative status is checked; do not start another payment."
          : "The secure payment session is not available yet. This attempt is retained while its authoritative backend status is checked.";
    setNotice(message);
  }, []);
  const resume = async () => { if (!intent || operationInFlight.current) return; operationInFlight.current = true; setWorking(true); setError(undefined); try { await openPaystack(await api.initializePayment(intent.orderId, intent.key, intent.method)); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not resume payment."); } finally { operationInFlight.current = false; setWorking(false); } };
  const retry = async () => { if (!intent || operationInFlight.current) return; operationInFlight.current = true; const nextIntent = { ...intent, key: crypto.randomUUID() }; sessionStorage.setItem(intentStorageKey, JSON.stringify(nextIntent)); setIntent(nextIntent); setWorking(true); setError(undefined); try { await openPaystack(await api.initializePayment(nextIntent.orderId, nextIntent.key, nextIntent.method)); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start a new payment attempt."); } finally { operationInFlight.current = false; setWorking(false); } };
  const clearStoredIntent = useCallback(() => { sessionStorage.removeItem(intentStorageKey); }, []);
  const confirmChangedPrice = async () => { if (!priceConfirmation || operationInFlight.current) return; operationInFlight.current = true; setWorking(true); setError(undefined); try { const nextIntent = { orderId: priceConfirmation.orderId, key: crypto.randomUUID(), method: priceConfirmation.method }; sessionStorage.setItem(intentStorageKey, JSON.stringify(nextIntent)); setIntent(nextIntent); setPriceConfirmation(undefined); setInitializingPayment(true); void refresh().catch(() => undefined); await openPaystack(await api.initializePayment(nextIntent.orderId, nextIntent.key, nextIntent.method)); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start secure payment."); } finally { operationInFlight.current = false; setInitializingPayment(false); setWorking(false); } };
  const pay = async () => { if (operationInFlight.current) return; const input = selectedInput(); if (!input) { setError(fulfillment === "DELIVERY" ? "Choose a delivery address." : "Choose a pickup point."); return; } if (!preview || previewLoading) { setError("Wait for a current checkout quote before paying."); return; } operationInFlight.current = true; setWorking(true); setError(undefined); setNotice(undefined); try { const visibleQuote = preview; const selection = JSON.stringify(input); if (!prepareKey.current || prepareKey.current.selection !== selection) prepareKey.current = { selection, key: crypto.randomUUID() }; const prepared = await api.prepareCheckout(input, prepareKey.current.key); if (!sameQuote(visibleQuote, prepared)) { setPriceConfirmation({ orderId: prepared.orderId, total: prepared.total, currencyCode: prepared.currencyCode, method: paymentMethod }); setNotice(`Your checkout total changed to ${prepared.currencyCode} ${prepared.total}. A second explicit confirmation is required before payment opens.`); return; } if (prepared.deliveryQuoteRequired) { setNotice("Your delivery quote request is awaiting a platform quote. Payment is not available yet."); void refresh().catch(() => undefined); return; } const nextIntent = { orderId: prepared.orderId, key: crypto.randomUUID(), method: paymentMethod }; sessionStorage.setItem(intentStorageKey, JSON.stringify(nextIntent)); setIntent(nextIntent); setInitializingPayment(true); void refresh().catch(() => undefined); await openPaystack(await api.initializePayment(nextIntent.orderId, nextIntent.key, nextIntent.method)); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start secure payment."); } finally { operationInFlight.current = false; setInitializingPayment(false); setWorking(false); } };

  if (sessionLoading) return <><StorefrontHeader /><StorefrontContainer className="max-w-5xl"><Skeleton className="h-10 w-56" /></StorefrontContainer></>;
  if (!session) return null;
  if (!intentLoaded) return <><StorefrontHeader /><StorefrontContainer className="max-w-5xl"><Skeleton className="h-10 w-56" /></StorefrontContainer></>;
  if (priceConfirmation) return <><StorefrontHeader /><StorefrontContainer className="max-w-2xl"><PageHeader eyebrow="Checkout price updated" title="Confirm the updated total" /><Alert tone="warning">The server repriced this order before payment. No payment has started.</Alert><p className="mt-5 text-lg">New total: <Money value={priceConfirmation.total} currency={priceConfirmation.currencyCode} /></p><div className="mt-5 flex gap-3"><Button loading={working} onClick={() => void confirmChangedPrice()}>Confirm and pay <Money value={priceConfirmation.total} currency={priceConfirmation.currencyCode} className="text-white" /> with {priceConfirmation.method === "MPESA" ? "M-Pesa" : "card"}</Button><Link className="inline-flex min-h-10 items-center justify-center text-sm font-semibold text-secondary hover:underline" href={`/checkout/payment/${priceConfirmation.orderId}`}>View order</Link></div></StorefrontContainer></>;
  if (intent?.orderId && initializingPayment) return <><StorefrontHeader /><StorefrontContainer className="max-w-2xl"><PageHeader eyebrow="Checkout" title="Opening secure payment" description="Your payment attempt is saved. Do not click Pay again while Paystack initializes." /><div className="mt-6"><Alert tone="info">Connecting to the secure payment provider…</Alert></div><Button className="mt-5" loading disabled>Opening secure payment</Button></StorefrontContainer></>;
  if (intent?.orderId) return <><StorefrontHeader /><StorefrontContainer className="max-w-2xl">{error && <div className="mb-5"><Alert tone="error">{error}</Alert></div>}{notice && <div className="mb-5"><Alert tone="info">{notice}</Alert></div>}<CheckoutPaymentProgress intent={intent} working={working} onResume={resume} onRetry={retry} onTerminal={clearStoredIntent} /></StorefrontContainer></>;
  if (cartLoading) return <><StorefrontHeader /><StorefrontContainer className="max-w-5xl"><Skeleton className="h-10 w-56" /></StorefrontContainer></>;
  if (!cart?.items.length) return <><StorefrontHeader /><StorefrontContainer className="max-w-2xl"><PageHeader eyebrow="Checkout" title="Your cart is empty" /><div className="mt-8"><EmptyState title="Add something to continue" detail="Choose an available offer before starting checkout." action={<Link className="font-semibold text-secondary hover:underline" href="/products">Browse products</Link>} /></div></StorefrontContainer></>;
  const total = preview?.total ?? cart.subtotal; const currency = preview?.currencyCode ?? cart.currency!; const canPay = Boolean(preview && !previewLoading && !preview.deliveryQuoteRequired && preview.availablePaymentMethods.includes(paymentMethod));
  const feeLines = [
    ...cart.items.map(item => ({ label: `${item.productName} × ${item.quantity}`, value: (Number(item.unitPrice) * item.quantity).toFixed(2), currency: item.currency })),
    ...(fulfillment === "DELIVERY" ? [{ label: "Delivery fee", value: preview?.deliveryFee ?? "0.00", currency }] : []),
    ...(fulfillment === "PICKUP" ? [{ label: "Pickup fee", value: preview?.pickupFee ?? "0.00", currency }] : []),
  ];
  return <><StorefrontHeader /><StorefrontContainer className="grid max-w-6xl gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
    <section><PageHeader eyebrow="Secure checkout" title="Delivery, payment, and confirmation" description="Review each step. Prices, eligibility, fees, and stock are confirmed by the server before Paystack opens." />
      {error && <div className="mt-5"><Alert tone="error">{error}</Alert></div>}{notice && <div className="mt-5"><Alert tone="info">{notice}</Alert></div>}
      <Surface className="mt-7"><SectionHeader title="1. Fulfilment" /><div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2"><SelectableCard selected={fulfillment === "DELIVERY"} onClick={() => setFulfillment("DELIVERY")}><strong>Delivery</strong><span className="mt-1 block text-sm text-foreground-muted">Send this order to a saved address</span></SelectableCard><SelectableCard selected={fulfillment === "PICKUP"} onClick={() => setFulfillment("PICKUP")}><strong>Pickup</strong><span className="mt-1 block text-sm text-foreground-muted">Collect from an available pickup point</span></SelectableCard></div></Surface>
      {fulfillment === "DELIVERY" && <Surface className="mt-5"><SectionHeader title="2. Delivery address" actions={<div className="flex flex-wrap gap-2"><Link className="inline-flex min-h-10 items-center text-sm font-semibold text-secondary hover:underline" href="/account/addresses">Manage addresses</Link><Button variant="outline" onClick={() => { setShowAddressForm(value => !value); setEditingAddressId(undefined); }}>Add address</Button></div>} />
        {showAddressForm && <div className="mt-5 border-t border-border pt-5"><CustomerAddressForm onSaved={applyAddress} onCancel={() => setShowAddressForm(false)} compact /></div>}
        {addresses.length ? <div className="mt-4 space-y-3" role="radiogroup" aria-label="Delivery address">{addresses.map(address => <div key={address.id}><SelectableCard role="radio" aria-checked={addressId === address.id} selected={addressId === address.id} onClick={() => setAddressId(address.id)}><span className="flex items-center justify-between gap-3"><strong>{address.label || address.recipientName}</strong>{address.isDefault && <span className="rounded-full bg-success/10 px-2 py-1 text-xs font-bold text-success">Default</span>}</span><p className="mt-1 text-sm text-foreground-muted">{address.recipientName} · {address.phone}<br />{addressLines(address).join(", ")}</p></SelectableCard>{addressId === address.id && <Button className="mt-2" variant="ghost" onClick={() => { setEditingAddressId(address.id); setShowAddressForm(false); }}>Edit selected address</Button>}{editingAddressId === address.id && <div className="mt-3 rounded-xl border border-border p-4"><CustomerAddressForm initial={address} onSaved={applyAddress} onCancel={() => setEditingAddressId(undefined)} compact /></div>}</div>)}</div> : !showAddressForm && <div className="mt-4"><Alert tone="info">Add a delivery address to continue.</Alert></div>}
      </Surface>}
      {fulfillment === "PICKUP" && <Surface className="mt-5"><SectionHeader title="2. Pickup point" /><div className="mt-4 space-y-3" role="radiogroup" aria-label="Pickup point">{points.map(point => <SelectableCard key={point.id} role="radio" aria-checked={pickupPointId === point.id} selected={pickupPointId === point.id} onClick={() => setPickupPointId(point.id)}><strong>{point.name}</strong><p className="mt-1 text-sm text-foreground-muted">{point.address}, {point.city} · <Money value={point.pickupFee} currency={currency} className="text-foreground" /></p></SelectableCard>)}{!points.length && <Alert tone="info">No active pickup points match this location.</Alert>}</div></Surface>}
      {preview && <Surface className="mt-5"><CheckoutPaymentOptions available={preview.availablePaymentMethods} selected={paymentMethod} onSelect={setPaymentMethod} heading="3. Payment method" /></Surface>}
      {preview?.deliveryQuoteRequired && <div className="mt-5"><Alert tone="warning">Delivery needs a manual quote. Card and M-Pesa remain unavailable until the quote is approved.</Alert></div>}
      <Surface className="mt-5"><SectionHeader title="4. Final confirmation" /><p className="mt-3 text-sm leading-6 text-foreground-muted">Your order is created only after the server rechecks price and stock. Card details and M-Pesa authorization are handled on genuine Paystack checkout.</p></Surface>
    </section>
    <aside className="lg:sticky lg:top-24 lg:self-start"><OrderSummary title="Order summary" lines={feeLines} subtotal={{ value: total, currency }} totalLabel="Final charge" note={previewLoading ? "Refreshing your server-authoritative delivery quote…" : "The displayed charge includes the applicable fulfilment fee."} action={<Button className="w-full" loading={working} disabled={!canPay} onClick={() => void pay()}>Pay <Money value={total} currency={currency} className="text-white" /> with {paymentMethod === "MPESA" ? "M-Pesa" : "card"}</Button>} /></aside>
  </StorefrontContainer></>;
}
