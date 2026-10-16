"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type PaymentStatusResponse } from "../lib/api";
import { paymentStateLabel, usePaymentConfirmation } from "./payment-confirmation";
import { Alert, Button, PageHeader, Skeleton } from "./ui";
import type { CheckoutPaymentMethod } from "./checkout-payment-options";

export type CheckoutPaymentIntent = { orderId: string; key: string; method: CheckoutPaymentMethod };

export function CheckoutPaymentProgress({ intent, working, onResume, onRetry, onTerminal }: {
  intent: CheckoutPaymentIntent;
  working: boolean;
  onResume: () => Promise<void>;
  onRetry: () => Promise<void>;
  onTerminal: () => void;
}) {
  const [initial, setInitial] = useState<PaymentStatusResponse>();
  const [error, setError] = useState<string>();
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setError(undefined);
    void api.paymentStatus(intent.orderId).then(value => { if (active) setInitial(value); }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Could not load payment status."); });
    return () => { active = false; };
  }, [intent.orderId, reload]);
  if (error) return <><PageHeader eyebrow="Checkout" title="Payment status unavailable" /><div className="mt-5"><Alert tone="error">{error}</Alert></div><div className="mt-5 flex flex-wrap gap-3"><Button onClick={() => setReload(value => value + 1)}>Check again</Button><Link className="inline-flex min-h-10 items-center justify-center px-2 text-sm font-semibold text-secondary hover:underline" href={`/checkout/payment/${encodeURIComponent(intent.orderId)}`}>Order details</Link></div></>;
  if (!initial) return <><PageHeader eyebrow="Checkout" title="Checking your payment" /><Skeleton className="mt-6 h-28 w-full" /></>;
  return <LoadedPaymentProgress initial={initial} intent={intent} working={working} onResume={onResume} onRetry={onRetry} onTerminal={onTerminal} />;
}

function LoadedPaymentProgress({ initial, intent, working, onResume, onRetry, onTerminal }: {
  initial: PaymentStatusResponse;
  intent: CheckoutPaymentIntent;
  working: boolean;
  onResume: () => Promise<void>;
  onRetry: () => Promise<void>;
  onTerminal: () => void;
}) {
  const { snapshot, state, checking, timedOut, temporaryError, checkAgain } = usePaymentConfirmation(intent.orderId, initial, true);
  useEffect(() => {
    if (["PAID", "PAYMENT_REVIEW", "EXPIRED", "CANCELLED"].includes(state)) onTerminal();
  }, [onTerminal, state]);
  const method = intent.method === "MPESA" ? "M-Pesa" : "card";
  const canResume = Boolean(snapshot.payment?.canResume);
  const canRetry = Boolean(snapshot.payment?.canRetry);
  const message = state === "PAID"
    ? "Payment is confirmed. Your order can now move to fulfilment."
    : state === "PAYMENT_REVIEW"
      ? "Payment was received, but this order needs review before fulfilment."
      : state === "FAILED"
        ? snapshot.payment?.failureKind === "CONFIGURATION_REJECTED"
          ? "Secure payments are temporarily unavailable because Paystack rejected the store configuration. No charge was started."
          : snapshot.payment?.failureKind === "PROVIDER_REJECTED"
            ? "Paystack rejected this checkout initialization. No charge was started."
            : snapshot.payment?.failureKind === "INITIALIZATION_FAILED"
              ? "Secure payment could not be initialized, and the backend confirmed that this attempt did not reach authorization."
              : "The provider confirmed that this payment attempt did not complete."
        : state === "UNKNOWN"
          ? snapshot.payment?.failureKind === "NETWORK_UNCERTAIN"
            ? "The connection to Paystack was interrupted. The result is still unknown; do not make a second payment while this attempt is checked."
            : "The provider result is still unknown. Do not make a second payment while this attempt is being checked."
          : timedOut
            ? "Confirmation is taking longer than expected. You can check again without creating another payment."
            : "Complete authorization with Paystack, then keep this page open while the backend confirms the result.";
  const tone = state === "PAID" ? "success" : state === "FAILED" || state === "EXPIRED" || state === "CANCELLED" ? "error" : "warning";
  return <>
    <PageHeader eyebrow="Checkout" title={paymentStateLabel(state)} description={`Order ${snapshot.order.orderNumber}`} />
    <div className="mt-6"><Alert tone={tone}>{message}</Alert></div>
    {temporaryError && <div className="mt-4"><Alert tone="info">{temporaryError} This does not mean the payment failed.</Alert></div>}
    <div className="mt-5 flex flex-wrap gap-3">
      {(state === "PENDING_CONFIRMATION" || state === "UNKNOWN") && canResume && <Button loading={working} onClick={() => void onResume()}>Resume {method} payment</Button>}
      {(state === "PENDING_CONFIRMATION" || state === "UNKNOWN") && <Button variant="outline" loading={checking} onClick={() => void checkAgain()}>Check payment status</Button>}
      {state === "FAILED" && canRetry && <Button loading={working} onClick={() => void onRetry()}>Try {method} again</Button>}
      {state === "PAYABLE" && <Button loading={working} onClick={() => void onRetry()}>Pay with {method}</Button>}
      <Link className="inline-flex min-h-10 items-center justify-center px-2 text-sm font-semibold text-secondary hover:underline" href={`/checkout/payment/${encodeURIComponent(intent.orderId)}`}>Order details</Link>
    </div>
    {(checking || working) && <p className="mt-4 text-sm text-foreground-muted" role="status" aria-live="polite">{working ? "Opening secure Paystack checkout…" : "Checking authoritative payment status…"}</p>}
  </>;
}
