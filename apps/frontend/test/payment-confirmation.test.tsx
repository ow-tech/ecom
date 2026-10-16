import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";

const mocks = vi.hoisted(() => ({
  paymentStatus: vi.fn(),
  verifyPayment: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  api: {
    paymentStatus: mocks.paymentStatus,
    verifyPayment: mocks.verifyPayment,
  },
}));

import { usePaymentConfirmation } from "../components/payment-confirmation";

const pending = {
  order: { id: "order", orderNumber: "EC-QA", status: "PENDING_PAYMENT" as const, paymentStatus: "UNPAID" as const },
  payment: { id: "payment", orderId: "order", provider: "PAYSTACK" as const, reference: "ref", status: "PENDING" as const, initializedAt: null, succeededAt: null, lastVerifiedAt: null, createdAt: "2026-10-12T00:00:00.000Z" },
};

function Harness() {
  const confirmation = usePaymentConfirmation("order", pending, true);
  return <output>{confirmation.state}</output>;
}

describe("payment confirmation polling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.paymentStatus.mockResolvedValue(pending);
    mocks.verifyPayment.mockResolvedValue(pending.payment);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("serializes checks and does not restart when response objects are replaced", async () => {
    render(<Harness />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

    expect(mocks.paymentStatus).toHaveBeenCalledTimes(2);
    expect(mocks.verifyPayment).toHaveBeenCalledTimes(1);

    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(mocks.paymentStatus).toHaveBeenCalledTimes(2);

    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(mocks.paymentStatus).toHaveBeenCalledTimes(3);
    expect(mocks.verifyPayment).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(14_000); });
    expect(mocks.verifyPayment).toHaveBeenCalledTimes(2);
  });
});
