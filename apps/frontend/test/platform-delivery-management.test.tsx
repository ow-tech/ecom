import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const api = vi.hoisted(() => ({
  platformPickupPoints: vi.fn(), platformDeliveryZones: vi.fn(), platformDeliveryRates: vi.fn(), platformDeliveryQuotes: vi.fn(),
  createPickupPoint: vi.fn(), updatePickupPoint: vi.fn(), createDeliveryZone: vi.fn(), updateDeliveryZone: vi.fn(),
  createDeliveryRate: vi.fn(), updateDeliveryRate: vi.fn(), setDeliveryQuote: vi.fn(),
}));
vi.mock("../lib/api", () => ({ api }));
import { DeliveryManagement } from "../components/platform-delivery-management";

const fixture = () => {
  api.platformPickupPoints.mockResolvedValue([{ id: "point-a", name: "CBD Collection", pickupFee: "100.00", countryCode: "KE", city: "Nairobi", region: "Nairobi", address: "CBD", status: "ACTIVE" }]);
  api.platformDeliveryZones.mockResolvedValue([{ id: "zone-a", name: "Nairobi Zone", countryCode: "KE", status: "ACTIVE" }]);
  api.platformDeliveryRates.mockResolvedValue([{ id: "rate-a", name: "CBD Delivery", amount: "200.00", currencyCode: "KES", deliveryZoneId: "zone-a", status: "ACTIVE" }]);
  api.platformDeliveryQuotes.mockResolvedValue([{ id: "quote-a", orderId: "order-a", status: "PENDING" }]);
  [api.createPickupPoint, api.updatePickupPoint, api.createDeliveryZone, api.updateDeliveryZone, api.createDeliveryRate, api.updateDeliveryRate, api.setDeliveryQuote].forEach(m => m.mockResolvedValue({}));
};
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("platform pickup and delivery management", () => {
  it("keeps all write controls hidden from read-only operators", async () => {
    fixture();
    render(<DeliveryManagement permissions={["platform.delivery.read", "platform.pickup_points.read"]} />);
    expect(await screen.findByText("CBD Collection")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Create zone" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Create pickup point" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Provide quote" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });
  it("creates a delivery zone through the protected API", async () => {
    fixture();
    render(<DeliveryManagement permissions={["platform.delivery.read", "platform.delivery.manage"]} />);
    expect(await screen.findByText(/Nairobi Zone/)).toBeTruthy();
    await userEvent.type(screen.getByLabelText("Zone name"), "Kiambu East");
    await userEvent.click(screen.getByRole("button", { name: "Create zone" }));
    await waitFor(() => expect(api.createDeliveryZone).toHaveBeenCalledWith(expect.objectContaining({ name: "Kiambu East", countryCode: "KE" })));
  });
  it("submits a manual quote without client-specified currency", async () => {
    fixture();
    render(<DeliveryManagement permissions={["platform.delivery.read", "platform.delivery.quote"]} />);
    const trigger = await screen.findByRole("button", { name: "Provide quote" });
    await userEvent.click(trigger);
    await userEvent.type(screen.getByLabelText("Quoted amount"), "350.00");
    await userEvent.click(screen.getByRole("button", { name: "Save quote" }));
    await waitFor(() => expect(api.setDeliveryQuote).toHaveBeenCalledWith("quote-a", expect.objectContaining({ amount: "350.00" })));
    const input = api.setDeliveryQuote.mock.calls[0][1];
    expect(input.currencyCode).toBeUndefined();
  });
  it("does not show saved state on API failure", async () => {
    fixture();
    api.createDeliveryZone.mockRejectedValueOnce(new Error("Permission denied"));
    render(<DeliveryManagement permissions={["platform.delivery.read", "platform.delivery.manage"]} />);
    await screen.findByText(/Nairobi Zone/);
    await userEvent.type(screen.getByLabelText("Zone name"), "Kiambu East");
    await userEvent.click(screen.getByRole("button", { name: "Create zone" }));
    expect(await screen.findByText("Permission denied")).toBeTruthy();
    expect(screen.queryByText("Changes saved.")).toBeNull();
  });
});
