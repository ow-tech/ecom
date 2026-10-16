import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const calls = vi.hoisted(() => ({ operations: vi.fn() }));
vi.mock("../lib/api", () => ({ api: { platformDeliveryOperations: calls.operations } }));
import { DeliveryOperations } from "../components/platform-delivery-operations";

const row = { id: "order-one", orderNumber: "EC-1001", status: "READY_FOR_PICKUP", paymentStatus: "PAID", fulfillmentMethod: "PICKUP", currencyCode: "KES", total: "1200.00", pickupSnapshot: { name: "Central Pickup", city: "Nairobi" }, deliveryAddress: null, supplierOrders: [{ id: "unit-one", status: "READY_FOR_PICKUP", supplier: { displayName: "Supplier A" } }] };
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("permission-scoped platform delivery operations queue", () => {
  it("shows live supplier progress and refreshes server data", async () => {
    calls.operations.mockResolvedValue({ data: [row], total: 1, page: 1, limit: 25 });
    render(<DeliveryOperations />);
    expect(await screen.findByText("EC-1001")).toBeTruthy();
    expect(screen.getByText(/Supplier A: READY FOR PICKUP/)).toBeTruthy();
    expect(screen.getByText(/Central Pickup/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(calls.operations).toHaveBeenCalledTimes(2));
  });
  it("sends status/method filters to the backend and resets the page", async () => {
    calls.operations.mockResolvedValue({ data: [row], total: 1, page: 1, limit: 25 });
    render(<DeliveryOperations />);
    await screen.findByText("EC-1001");
    await userEvent.selectOptions(screen.getByLabelText("Fulfilment method"), "PICKUP");
    await userEvent.selectOptions(screen.getByLabelText("Order status"), "READY_FOR_PICKUP");
    await waitFor(() => expect(calls.operations).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, limit: 25, fulfillmentMethod: "PICKUP", status: "READY_FOR_PICKUP" })));
  });
  it("ignores a delayed old-filter response when a newer filter has completed", async () => {
    let resolveOld!: (value: any) => void;
    const old = new Promise<any>(resolve => { resolveOld = resolve; });
    const next = { ...row, id: "delivery-two", orderNumber: "EC-2002", status: "OUT_FOR_DELIVERY", fulfillmentMethod: "DELIVERY", pickupSnapshot: null, deliveryAddress: { city: "Nairobi", region: "Nairobi" } };
    calls.operations.mockImplementation(({ fulfillmentMethod }: { fulfillmentMethod?: string }) =>
      fulfillmentMethod === "DELIVERY"
        ? Promise.resolve({ data: [next], total: 1, page: 1, limit: 25 })
        : old);
    render(<DeliveryOperations />);
    await waitFor(() => expect(calls.operations).toHaveBeenCalledTimes(1));
    await userEvent.selectOptions(screen.getByLabelText("Fulfilment method"), "DELIVERY");
    expect(await screen.findByText("EC-2002")).toBeTruthy();
    resolveOld({ data: [row], total: 1, page: 1, limit: 25 });
    await waitFor(() => expect(calls.operations).toHaveBeenCalledTimes(2));
    expect(screen.getByText("EC-2002")).toBeTruthy();
    expect(screen.queryByText("EC-1001")).toBeNull();
  });
  it("offers a real retry on read failure without displaying stale records", async () => {
    calls.operations.mockRejectedValueOnce(new Error("Temporary outage")).mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 25 });
    render(<DeliveryOperations />);
    expect(await screen.findByText(/Temporary outage/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No matching fulfilment work")).toBeTruthy();
  });
});
