"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CustomerOrder, PaymentAttempt } from "../lib/api";
import { payments } from "../lib/payments";
import { customerPaymentState, isTerminalCustomerPaymentState, shouldPollPayment, type CustomerPaymentState } from "../lib/payment-state";

const POLL_INTERVAL_MS = 2_000;
const MAX_AUTOMATIC_CHECKS = 100;
const AUTHORITATIVE_CHECK_EVERY = 8;

type Snapshot = { order: Pick<CustomerOrder, "id" | "orderNumber" | "status" | "paymentStatus">; payment: PaymentAttempt | null };

export function usePaymentConfirmation(orderId: string, initial: Snapshot, verifyOnLoad: boolean) {
  const [snapshot, setSnapshot] = useState(initial);
  const [checking, setChecking] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [temporaryError, setTemporaryError] = useState<string>();
  const checks = useRef(0);
  const latestSnapshot = useRef(initial);
  const inFlight = useRef<Promise<Snapshot | null> | null>(null);
  const lifecycle = useRef(0);
  const state = customerPaymentState(snapshot.order, snapshot.payment);

  const check = useCallback((verify = false, generation = lifecycle.current) => {
    if (inFlight.current) return inFlight.current;
    let request!: Promise<Snapshot | null>;
    request = (async () => {
      if (generation === lifecycle.current) { setChecking(true); setTemporaryError(undefined); }
      try {
        let next = await payments.getPaymentStatus(orderId);
        if (verify && next.payment && !isTerminalCustomerPaymentState(customerPaymentState(next.order, next.payment))) {
          await payments.verifyPayment(orderId, next.payment.id);
          next = await payments.getPaymentStatus(orderId);
        }
        if (generation === lifecycle.current) {
          latestSnapshot.current = next;
          setSnapshot(next);
        }
        return next;
      } catch (cause) {
        if (generation === lifecycle.current) setTemporaryError(cause instanceof Error ? cause.message : "We could not confirm the payment yet.");
        return null;
      } finally {
        if (inFlight.current === request) inFlight.current = null;
        if (generation === lifecycle.current) setChecking(false);
      }
    })();
    inFlight.current = request;
    return request;
  }, [orderId]);

  useEffect(() => {
    const generation = ++lifecycle.current;
    latestSnapshot.current = initial;
    setSnapshot(initial);
    checks.current = 0;
    setTimedOut(false);
    let active = true;
    let timer: number | undefined;
    const poll = async () => {
      const current = customerPaymentState(latestSnapshot.current.order, latestSnapshot.current.payment);
      if (!active || !shouldPollPayment(current, checks.current, MAX_AUTOMATIC_CHECKS)) return;
      checks.current += 1;
      await check(verifyOnLoad && (checks.current - 1) % AUTHORITATIVE_CHECK_EVERY === 0, generation);
      if (!active || generation !== lifecycle.current) return;
      const nextState = customerPaymentState(latestSnapshot.current.order, latestSnapshot.current.payment);
      if (checks.current >= MAX_AUTOMATIC_CHECKS) { setTimedOut(true); return; }
      if (shouldPollPayment(nextState, checks.current, MAX_AUTOMATIC_CHECKS)) timer = window.setTimeout(() => void poll(), POLL_INTERVAL_MS);
    };
    // Response objects are replaced after every successful read. Depending on their
    // identities would restart this effect and cause immediate, overlapping polls.
    void poll();
    return () => { active = false; lifecycle.current += 1; if (timer !== undefined) window.clearTimeout(timer); };
  }, [check, initial, orderId, verifyOnLoad]);

  const checkAgain = useCallback(async () => {
    const generation = lifecycle.current;
    if (inFlight.current) await inFlight.current;
    if (generation !== lifecycle.current) return;
    checks.current = 0;
    setTimedOut(false);
    await check(true, generation);
  }, [check]);
  return { snapshot, state, checking, timedOut, temporaryError, checkAgain };
}

export function paymentStateLabel(state: CustomerPaymentState) {
  return ({ PAYABLE: "Ready to pay", PENDING_CONFIRMATION: "Confirming payment", PAID: "Payment confirmed", FAILED: "Payment failed", PAYMENT_REVIEW: "Payment review", AWAITING_DELIVERY_QUOTE: "Awaiting delivery quote", EXPIRED: "Order expired", CANCELLED: "Order cancelled", UNKNOWN: "Payment status pending" })[state];
}
