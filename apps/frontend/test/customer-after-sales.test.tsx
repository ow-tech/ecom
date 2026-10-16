import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  state: { session: { id: "customer", email: "owned@example.test" } as { id: string; email: string } | null, loading: false },
  api: { customerOrder: vi.fn(), customerRefundRequests: vi.fn(), customerReturns: vi.fn(),
    customerWarranties: vi.fn(), createCustomerRefundRequest: vi.fn(),
    createCustomerReturn: vi.fn(), createCustomerWarranty: vi.fn() },
}));
vi.mock("next/navigation", () => ({ useParams: () => ({ orderId: "owned-order" }), useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("../components/session-provider", () => ({ useSession: () => mocks.state }));
vi.mock("../components/storefront-header", () => ({ StorefrontHeader: () => <header>Storefront</header> }));
vi.mock("../lib/api", () => ({ api: mocks.api }));

import { CustomerAfterSales } from "../components/customer-after-sales";
const order = { id: "owned-order", orderNumber: "EC-OWNED", status: "DELIVERED", paymentStatus: "PAID", currencyCode: "KES",
  items: [{ id: "owned-item", productNameSnapshot: "Laptop", variantNameSnapshot: null, quantity: 2, warrantyDaysSnapshot: 30 }] };
beforeEach(() => {
  mocks.state.session = { id: "customer", email: "owned@example.test" };
  mocks.api.customerOrder.mockResolvedValue(order);
  mocks.api.customerRefundRequests.mockResolvedValue([]);
  mocks.api.customerReturns.mockResolvedValue([]);
  mocks.api.customerWarranties.mockResolvedValue([]);
  mocks.api.createCustomerRefundRequest.mockResolvedValue({ id: "r1", status: "REQUESTED" });
  mocks.api.createCustomerReturn.mockResolvedValue({ id: "ret1", status: "REQUESTED" });
  mocks.api.createCustomerWarranty.mockResolvedValue({ id: "w1", status: "SUBMITTED" });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("customer-owned after-sales workflow", () => {
  it("submits one owned return item with reason/quantity but never price", async () => {
    render(<CustomerAfterSales />);
    expect(await screen.findByText("Order EC-OWNED")).toBeTruthy();
    await userEvent.selectOptions(screen.getByLabelText("Reason"), "DEFECTIVE");
    await userEvent.click(screen.getByRole("button", { name: "Submit return request" }));
    await waitFor(() => expect(mocks.api.createCustomerReturn).toHaveBeenCalledWith("owned-order",
      expect.objectContaining({ reasonCode: "DEFECTIVE", items: [{ orderItemId: "owned-item", quantity: 1 }] })));
    const submitted = mocks.api.createCustomerReturn.mock.calls[0][1];
    expect(submitted.amount).toBeUndefined();
    expect(submitted.customerId).toBeUndefined();
    expect(await screen.findByText(/Request submitted/)).toBeTruthy();
  });
  it("submits refund and warranty through separate canonical endpoints", async () => {
    render(<CustomerAfterSales />);
    await screen.findByText("Order EC-OWNED");
    await userEvent.selectOptions(screen.getByLabelText("Request type"), "REFUND");
    await userEvent.click(screen.getByRole("button", { name: "Submit refund request" }));
    await waitFor(() => expect(mocks.api.createCustomerRefundRequest).toHaveBeenCalledWith("owned-order",
      expect.objectContaining({ items: [{ orderItemId: "owned-item", quantity: 1 }] })));
    await userEvent.selectOptions(screen.getByLabelText("Request type"), "WARRANTY");
    await userEvent.type(screen.getByLabelText("Describe the issue"), "Display flickers after normal use.");
    await userEvent.click(screen.getByRole("button", { name: "Submit warranty claim" }));
    await waitFor(() => expect(mocks.api.createCustomerWarranty).toHaveBeenCalledWith({ orderItemId: "owned-item", issueDescription: "Display flickers after normal use." }));
  });
  it("disables submission for undelivered orders while preserving request history", async () => {
    mocks.api.customerOrder.mockResolvedValue({ ...order, status: "PROCESSING" });
    mocks.api.customerReturns.mockResolvedValue([{ id: "past-return", status: "APPROVED" }]);
    render(<CustomerAfterSales />);
    expect(await screen.findByText("Order EC-OWNED")).toBeTruthy();
    expect(screen.getByText(/Requests can be submitted only after/)).toBeTruthy();
    expect(screen.getByText("APPROVED")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Submit return request" })).toBeNull();
  });
  it("does not confirm success on server rejection", async () => {
    mocks.api.createCustomerReturn.mockRejectedValueOnce(new Error("Remaining return quantity exceeded"));
    render(<CustomerAfterSales />);
    await screen.findByText("Order EC-OWNED");
    await userEvent.click(screen.getByRole("button", { name: "Submit return request" }));
    expect(await screen.findByText(/Remaining return quantity exceeded/)).toBeTruthy();
    expect(screen.queryByText(/Request submitted/)).toBeNull();
  });
  it("does not query owned API when signed out", async () => {
    mocks.state.session = null;
    render(<CustomerAfterSales />);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalled());
    expect(mocks.api.customerOrder).not.toHaveBeenCalled();
  });
});
