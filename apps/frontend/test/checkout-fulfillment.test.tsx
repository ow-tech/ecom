import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

const mocks = vi.hoisted(() => ({
  api: { customerAddresses: vi.fn(), createCustomerAddress: vi.fn(), updateCustomerAddress: vi.fn(), pickupPoints: vi.fn(), previewCheckout: vi.fn(), prepareCheckout: vi.fn(), initializePayment: vi.fn(), paymentStatus: vi.fn(), verifyPayment: vi.fn() },
  cart: undefined as undefined | Record<string, unknown>, refresh: vi.fn(), replace: vi.fn(), redirectToPaystack: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("../components/session-provider", () => ({ useSession: () => ({ session: { id: "customer" }, loading: false }) }));
vi.mock("../components/cart-provider", () => ({ useCart: () => ({ cart: mocks.cart, loading: false, refresh: mocks.refresh }) }));
vi.mock("../components/storefront-header", () => ({ StorefrontHeader: () => <header>Storefront</header> }));
vi.mock("../lib/api", () => ({ api: mocks.api, checkoutFulfillmentMethod: { DELIVERY: "DELIVERY", PICKUP: "PICKUP" } }));
vi.mock("../lib/paystack-hosted", () => ({ redirectToPaystackHostedCheckout: mocks.redirectToPaystack }));

import CheckoutPage from "../app/checkout/page";

const address = { id: "11111111-1111-4111-8111-111111111111", label: "Home", recipientName: "QA customer", phone: "+254700000000", countryCode: "KE", region: "Nairobi", city: "Nairobi", estate: null, street: "Main", building: null, houseNumber: null, landmark: null, alternativePhone: null, deliveryNotes: null, isDefault: true };
const point = { id: "22222222-2222-4222-8222-222222222222", name: "QA pickup", code: "QA", slug: "qa", countryCode: "KE", region: "Nairobi", city: "Nairobi", address: "Collection road", landmark: null, phone: null, pickupFee: "25.00", storageLimitDays: 3 };
const prepared = { orderId: "order", orderNumber: "EC-QA", status: "PENDING_PAYMENT", paymentStatus: "UNPAID", fulfillmentMethod: "DELIVERY", currencyCode: "KES", subtotal: "10.00", deliveryFee: "0.00", pickupFee: "0.00", total: "10.00", deliveryQuoteRequired: false, supplierOrderCount: 1, createdAt: "2026-10-11T00:00:00.000Z" };
const preview = { currencyCode: "KES", subtotal: "10.00", deliveryFee: "0.00", pickupFee: "0.00", total: "10.00", deliveryQuoteRequired: false, availablePaymentMethods: ["CARD"] };

beforeEach(() => {
  vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "checkout-idempotency-key") });
  mocks.cart = { id: "cart", currency: "KES", subtotal: "10.00", items: [{ id: "line", supplierListingId: "listing", quantity: 1, unitPrice: "10.00", currency: "KES", productName: "QA item" }] };
  mocks.api.customerAddresses.mockResolvedValue([address]); mocks.api.pickupPoints.mockResolvedValue([point]); mocks.api.previewCheckout.mockResolvedValue(preview); mocks.api.prepareCheckout.mockResolvedValue(prepared); mocks.api.initializePayment.mockResolvedValue({ paymentId: "payment", status: "PENDING", authorizationUrl: null, accessCode: null }); mocks.api.paymentStatus.mockResolvedValue({ order: { id: "order", orderNumber: "EC-QA", status: "PENDING_PAYMENT", paymentStatus: "UNPAID" }, payment: { id: "payment", orderId: "order", provider: "PAYSTACK", reference: "ref", status: "PENDING", initializedAt: null, succeededAt: null, lastVerifiedAt: null, createdAt: "2026-10-11T00:00:00.000Z" } }); mocks.api.verifyPayment.mockResolvedValue({ status: "PENDING" }); mocks.refresh.mockResolvedValue(undefined);
  mocks.api.updateCustomerAddress.mockImplementation(async (_id: string, input: Record<string, unknown>) => ({ ...address, ...input }));
});
afterEach(() => { cleanup(); window.sessionStorage.clear(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("CheckoutPage fulfilment contract", () => {
  it("defaults to delivery when a saved default address exists without submitting", async () => {
    render(<CheckoutPage />);
    await screen.findByRole("radio", { name: /Home/ });
    await waitFor(() => expect(mocks.api.previewCheckout).toHaveBeenCalledWith({ fulfillmentMethod: "DELIVERY", addressId: address.id }));
    expect(mocks.api.prepareCheckout).not.toHaveBeenCalled();
  });

  it("sends the exact DELIVERY enum and only the selected address", async () => {
    render(<CheckoutPage />);
    await userEvent.click(await screen.findByRole("button", { name: /^Delivery/ }));
    await userEvent.click(await screen.findByRole("button", { name: /Pay/ }));
    await waitFor(() => expect(mocks.api.prepareCheckout).toHaveBeenCalledWith({ fulfillmentMethod: "DELIVERY", addressId: address.id }, "checkout-idempotency-key"));
    expect(mocks.api.prepareCheckout.mock.calls[0][0]).not.toHaveProperty("pickupPointId");
  });

  it("requires an address for Delivery without calling the API", async () => {
    mocks.api.customerAddresses.mockResolvedValue([]);
    render(<CheckoutPage />);
    await userEvent.click(await screen.findByRole("button", { name: /^Delivery/ }));
    expect(screen.getByRole("button", { name: /Pay/ }).hasAttribute("disabled")).toBe(true);
    expect(mocks.api.prepareCheckout).not.toHaveBeenCalled();
  });

  it("sends the exact PICKUP enum and only the selected PickupPoint", async () => {
    render(<CheckoutPage />);
    await userEvent.click(await screen.findByRole("button", { name: /^Pickup/ }));
    await screen.findByRole("radio", { name: /QA pickup/ });
    await userEvent.click(await screen.findByRole("button", { name: /Pay/ }));
    await waitFor(() => expect(mocks.api.prepareCheckout).toHaveBeenCalledWith({ fulfillmentMethod: "PICKUP", pickupPointId: point.id }, "checkout-idempotency-key"));
    expect(mocks.api.prepareCheckout.mock.calls[0][0]).not.toHaveProperty("addressId");
  });

  it("uses the final selection when fulfilment changes before submission", async () => {
    render(<CheckoutPage />);
    await userEvent.click(await screen.findByRole("button", { name: /^Delivery/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Pickup/ }));
    await screen.findByRole("radio", { name: /QA pickup/ });
    await userEvent.click(await screen.findByRole("button", { name: /Pay/ }));
    await waitFor(() => expect(mocks.api.prepareCheckout).toHaveBeenCalledWith({ fulfillmentMethod: "PICKUP", pickupPointId: point.id }, "checkout-idempotency-key"));
  });

  it("requires a PickupPoint and presents backend validation errors", async () => {
    mocks.api.pickupPoints.mockResolvedValue([]);
    render(<CheckoutPage />);
    await userEvent.click(await screen.findByRole("button", { name: /^Pickup/ }));
    await screen.findByText("No active pickup points match this location.");
    expect(screen.getByRole("button", { name: /Pay/ }).hasAttribute("disabled")).toBe(true);
    expect(mocks.api.prepareCheckout).not.toHaveBeenCalled();
  });

  it("presents backend validation errors without losing their message", async () => {
    mocks.api.prepareCheckout.mockRejectedValueOnce(new Error("fulfillmentMethod must be one of the following values: DELIVERY, PICKUP"));
    render(<CheckoutPage />);
    await userEvent.click(await screen.findByRole("button", { name: /^Delivery/ }));
    await userEvent.click(await screen.findByRole("button", { name: /Pay/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("fulfillmentMethod must be one of the following values");
  });

  it("keeps the generated idempotency key stable for the submitted attempt", async () => {
    render(<CheckoutPage />);
    await userEvent.click(await screen.findByRole("button", { name: /^Delivery/ }));
    await userEvent.click(await screen.findByRole("button", { name: /Pay/ }));
    await waitFor(() => expect(mocks.api.prepareCheckout).toHaveBeenCalledTimes(1));
    expect(mocks.api.prepareCheckout.mock.calls[0][1]).toBe("checkout-idempotency-key");
  });

  it("requires a second explicit click when prepare returns changed money", async () => {
    mocks.api.prepareCheckout.mockResolvedValueOnce({ ...prepared, total: "11.00", deliveryFee: "1.00" });
    render(<CheckoutPage />);
    const payButton = await screen.findByRole("button", { name: /Pay/ });
    await waitFor(() => expect(payButton.hasAttribute("disabled")).toBe(false));
    await userEvent.click(payButton);
    expect(await screen.findByText(/server repriced/i)).toBeTruthy();
    expect(mocks.api.initializePayment).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /Confirm and pay/ }));
    await waitFor(() => expect(mocks.api.initializePayment).toHaveBeenCalledTimes(1));
  });

  it("uses M-Pesa only when the quote exposes it", async () => {
    mocks.api.previewCheckout.mockResolvedValueOnce({ ...preview, availablePaymentMethods: ["CARD", "MPESA"] });
    render(<CheckoutPage />);
    await userEvent.click(await screen.findByRole("radio", { name: /M-Pesa/ }));
    await userEvent.click(screen.getByRole("button", { name: /Pay/ }));
    await waitFor(() => expect(mocks.api.initializePayment).toHaveBeenCalledWith("order", "checkout-idempotency-key", "MPESA"));
  });

  it("shows only backend-eligible methods and makes the selection explicit", async () => {
    render(<CheckoutPage />);
    expect((await screen.findByRole("radio", { name: "Visa or Mastercard" })).getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByRole("radio", { name: "M-Pesa mobile payment" })).toBeNull();
    expect(screen.getByText("VISA")).toBeTruthy();
    expect(screen.getByText("Mastercard")).toBeTruthy();
  });

  it("refreshes the server delivery quote after editing the selected address", async () => {
    render(<CheckoutPage />);
    await waitFor(() => expect(mocks.api.previewCheckout).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole("button", { name: "Edit selected address" }));
    const city = screen.getByLabelText("City / town");
    await userEvent.clear(city);
    await userEvent.type(city, "Mombasa");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mocks.api.updateCustomerAddress).toHaveBeenCalledWith(address.id, expect.objectContaining({ city: "Mombasa" })));
    await waitFor(() => expect(mocks.api.previewCheckout.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(await screen.findByText(/delivery quote has been refreshed/i)).toBeTruthy();
  });

  it("redirects to the provider authorization URL returned by the backend", async () => {
    mocks.api.initializePayment.mockResolvedValueOnce({ paymentId: "payment", status: "PENDING", authorizationUrl: "https://checkout.paystack.test/provider-session", accessCode: "provider-access-code" });
    render(<CheckoutPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Pay/ }));
    await waitFor(() => expect(mocks.redirectToPaystack).toHaveBeenCalledWith("https://checkout.paystack.test/provider-session"));
  });

  it("keeps a single stable initialization state before payment progress mounts", async () => {
    let resolveInitialization!: (value: { paymentId: string; status: string; authorizationUrl: null; accessCode: null }) => void;
    mocks.api.prepareCheckout.mockResolvedValueOnce({ ...prepared, orderId: "stable-order" });
    mocks.api.initializePayment.mockReturnValueOnce(new Promise(resolve => { resolveInitialization = resolve; }));
    render(<CheckoutPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Pay/ }));
    expect(await screen.findByRole("heading", { name: "Opening secure payment" })).toBeTruthy();
    expect(mocks.api.initializePayment).toHaveBeenCalledTimes(1);
    expect(mocks.api.paymentStatus).not.toHaveBeenCalledWith("stable-order");
    await act(async () => { resolveInitialization({ paymentId: "payment", status: "PENDING", authorizationUrl: null, accessCode: null }); });
    expect(await screen.findByRole("heading", { name: "Confirming payment" })).toBeTruthy();
  });

  it("gives a pending attempt priority over the cart without inventing a resume action", async () => {
    window.sessionStorage.setItem("ecom.checkout.payment-intent", JSON.stringify({ orderId: "order", key: "payment-key", method: "CARD" }));
    render(<CheckoutPage />);
    expect(await screen.findByRole("heading", { name: "Confirming payment" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Resume card payment" })).toBeNull();
    expect(screen.getByRole("button", { name: /Check payment status/ })).toBeTruthy();
  });

  it("resumes only when the backend reports a usable provider session", async () => {
    mocks.api.paymentStatus.mockResolvedValue({ order: { id: "order", orderNumber: "EC-QA", status: "PENDING_PAYMENT", paymentStatus: "UNPAID" }, payment: { id: "payment", orderId: "order", provider: "PAYSTACK", reference: "ref", status: "PENDING", initializedAt: "2026-10-11T00:00:00.000Z", succeededAt: null, lastVerifiedAt: null, createdAt: "2026-10-11T00:00:00.000Z", canResume: true } });
    window.sessionStorage.setItem("ecom.checkout.payment-intent", JSON.stringify({ orderId: "order", key: "payment-key", method: "CARD" }));
    render(<CheckoutPage />);
    expect(await screen.findByRole("button", { name: "Resume card payment" })).toBeTruthy();
  });

  it("offers a recoverable check when the initial status read fails", async () => {
    mocks.api.paymentStatus.mockRejectedValueOnce(new Error("Temporary network error"));
    window.sessionStorage.setItem("ecom.checkout.payment-intent", JSON.stringify({ orderId: "order", key: "payment-key", method: "CARD" }));
    render(<CheckoutPage />);
    expect(await screen.findByRole("heading", { name: "Payment status unavailable" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Check again" }));
    expect(await screen.findByRole("heading", { name: "Confirming payment" })).toBeTruthy();
  });

  it("retries a provider-failed attempt with a fresh payment idempotency key", async () => {
    mocks.cart = { id: "cart", currency: null, subtotal: "0.00", items: [] };
    mocks.api.paymentStatus.mockResolvedValue({ order: { id: "order", orderNumber: "EC-QA", status: "PENDING_PAYMENT", paymentStatus: "UNPAID" }, payment: { id: "payment", orderId: "order", provider: "PAYSTACK", reference: "ref", status: "FAILED", initializedAt: null, succeededAt: null, lastVerifiedAt: null, createdAt: "2026-10-11T00:00:00.000Z", canRetry: true, failureKind: "INITIALIZATION_FAILED" } });
    window.sessionStorage.setItem("ecom.checkout.payment-intent", JSON.stringify({ orderId: "order", key: "used-payment-key", method: "CARD" }));
    render(<CheckoutPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Try card again" }));
    await waitFor(() => expect(mocks.api.initializePayment).toHaveBeenCalledWith("order", "checkout-idempotency-key", "CARD"));
    expect(JSON.parse(window.sessionStorage.getItem("ecom.checkout.payment-intent")!)).toEqual({ orderId: "order", key: "checkout-idempotency-key", method: "CARD" });
  });

  it.each([
    ["FAILED", "CONFIGURATION_REJECTED", /Paystack rejected the store configuration/i],
    ["UNKNOWN", "NETWORK_UNCERTAIN", /connection to Paystack was interrupted/i],
  ])("shows a safe customer-facing %s / %s initialization failure", async (status, failureKind, message) => {
    mocks.cart = { id: "cart", currency: null, subtotal: "0.00", items: [] };
    mocks.api.paymentStatus.mockResolvedValue({ order: { id: "order", orderNumber: "EC-QA", status: "PENDING_PAYMENT", paymentStatus: "UNPAID" }, payment: { id: "payment", orderId: "order", provider: "PAYSTACK", reference: "ref", status, initializedAt: null, succeededAt: null, lastVerifiedAt: null, createdAt: "2026-10-11T00:00:00.000Z", canRetry: status === "FAILED", failureKind } });
    window.sessionStorage.setItem("ecom.checkout.payment-intent", JSON.stringify({ orderId: "order", key: "payment-key", method: "CARD" }));
    render(<CheckoutPage />);
    expect(await screen.findByText(message)).toBeTruthy();
  });
});
