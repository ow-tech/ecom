import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, checkoutFulfillmentMethod } from "../lib/api";

afterEach(() => vi.unstubAllGlobals());

describe("checkout API contract", () => {
  it.each([
    [{ fulfillmentMethod: checkoutFulfillmentMethod.DELIVERY, addressId: "address-id" }, { fulfillmentMethod: "DELIVERY", addressId: "address-id" }],
    [{ fulfillmentMethod: checkoutFulfillmentMethod.PICKUP, pickupPointId: "pickup-point-id" }, { fulfillmentMethod: "PICKUP", pickupPointId: "pickup-point-id" }],
  ] as const)("serializes only the exact backend %s payload", async (input, expected) => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ orderId: "order" }), { status: 201, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetch);
    await api.prepareCheckout(input, "checkout-idempotency-key");
    expect(fetch).toHaveBeenCalledWith("/api/customer/checkout/prepare", expect.objectContaining({ method: "POST", headers: expect.objectContaining({ "content-type": "application/json", "Idempotency-Key": "checkout-idempotency-key" }), body: JSON.stringify(expected) }));
  });

  it("retains a backend DTO validation array for the checkout error UI", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: ["fulfillmentMethod must be one of the following values: DELIVERY, PICKUP"] }), { status: 400, headers: { "content-type": "application/json" } })));
    await expect(api.prepareCheckout({ fulfillmentMethod: checkoutFulfillmentMethod.DELIVERY, addressId: "address-id" }, "key")).rejects.toEqual(new ApiError(400, "fulfillmentMethod must be one of the following values: DELIVERY, PICKUP"));
  });
});
