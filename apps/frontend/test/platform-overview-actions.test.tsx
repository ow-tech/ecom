import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  summary: vi.fn(),
  session: { id: "platform-admin", platformPermissions: [
    "platform.operations.read", "platform.suppliers.read", "platform.payments.read",
    "platform.orders.read", "platform.delivery.read", "platform.refunds.read", "platform.support.read",
  ] },
}));
vi.mock("../lib/api", () => ({ api: { platformSummary: mocks.summary }, ApiError: class ApiError extends Error {} }));
vi.mock("../components/session-provider", () => ({ useSession: () => ({ session: mocks.session }) }));
import { PlatformWorkspace } from "../components/platform-workspace";
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("platform actionable operational KPI cards", () => {
  it("opens filtered real records rather than inert statistic cards", async () => {
    mocks.summary.mockResolvedValue({
      suppliers: { pendingReview: 2 }, payments: { paymentReview: 3, unknown: 4 },
      orders: { awaitingDeliveryQuote: 5, readyForPickup: 6, outForDelivery: 7 },
      refunds: { pendingReview: 8 }, support: { open: 9 },
    });
    render(<PlatformWorkspace section="overview" />);
    const cases = [
      ["Supplier approvals", "/platform/suppliers?status=PENDING_REVIEW"],
      ["Payment review", "/platform/orders?status=PAYMENT_REVIEW"],
      ["Unknown payments", "/platform/payments?status=UNKNOWN"],
      ["Delivery quotes", "/platform/delivery#delivery-quotes"],
      ["Ready for pickup", "/platform/orders?status=READY_FOR_PICKUP"],
      ["Out for delivery", "/platform/orders?status=OUT_FOR_DELIVERY"],
      ["Refunds pending", "/platform/aftersales?focus=refunds-pending"],
      ["Open support", "/platform/support?status=OPEN"],
    ] as const;
    for (const [name, href] of cases) {
      expect((await screen.findByRole("link", { name: new RegExp(name) })).getAttribute("href")).toBe(href);
    }
  });
});
