import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

const mocks = vi.hoisted(() => ({ push: vi.fn(), getProduct: vi.fn(), addItem: vi.fn(), fly: vi.fn(), session: { id: "customer" } as { id: string } | null }));
vi.mock("next/navigation", () => ({ useParams: () => ({ listingId: "phone" }), useRouter: () => ({ push: mocks.push }), useSearchParams: () => new URLSearchParams() }));
vi.mock("../lib/catalogue", () => ({ catalogue: { getProduct: (...args: unknown[]) => mocks.getProduct(...args) } }));
vi.mock("../components/session-provider", () => ({ useSession: () => ({ session: mocks.session, loading: false }) }));
vi.mock("../components/cart-provider", () => ({ useCart: () => ({ addItem: mocks.addItem, count: 0 }) }));
vi.mock("../components/storefront-header", () => ({ StorefrontHeader: () => <header>Storefront</header> }));
vi.mock("../components/fly-to-cart", () => ({ flyToCart: (...args: unknown[]) => mocks.fly(...args) }));
import ProductPage from "../app/products/[listingId]/page";

const product = { id: "phone", name: "Android Smartphone", slug: "phone", brand: "Ecom", description: "A phone", category: { id: "tech", name: "Technology", slug: "technology" }, image: { id: "image", url: "https://example.test/phone.jpg", altText: "Phone" }, media: [{ id: "image", url: "https://example.test/phone.jpg", altText: "Phone" }], variants: [{ id: "black", name: "128GB / Black" }], offerCount: 1, offers: [{ id: "offer", price: "100.00", currencyCode: "USD", variantId: "black", variant: { id: "black", name: "128GB / Black" }, availability: "IN_STOCK", supplier: { slug: "shop", name: "Shop" } }] };
beforeEach(() => { mocks.session = { id: "customer" }; mocks.getProduct.mockResolvedValue(product); mocks.addItem.mockResolvedValue(undefined); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("product cart feedback", () => {
  it("shows a real product confirmation and starts decoration only after the cart mutation succeeds", async () => {
    render(<ProductPage />); await screen.findByRole("heading", { name: "Android Smartphone" });
    await userEvent.click(screen.getByRole("button", { name: /128GB \/ Black.*Add to cart/ }));
    await waitFor(() => expect(mocks.addItem).toHaveBeenCalledWith("offer"));
    expect(mocks.fly).toHaveBeenCalledTimes(1); expect(screen.getByRole("status").textContent).toContain("Android Smartphone — 128GB / Black");
    expect(mocks.push).not.toHaveBeenCalled(); expect(screen.getByRole("link", { name: "View cart" }).getAttribute("href")).toBe("/cart");
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" })); expect(screen.queryByRole("status")).toBeNull();
  });
  it("does not animate or claim success when the authoritative cart mutation fails", async () => {
    mocks.addItem.mockRejectedValueOnce(new Error("Unavailable")); render(<ProductPage />); await screen.findByRole("heading", { name: "Android Smartphone" });
    await userEvent.click(screen.getByRole("button", { name: /128GB \/ Black.*Add to cart/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("Unavailable"); expect(mocks.fly).not.toHaveBeenCalled(); expect(screen.queryByRole("status")).toBeNull();
  });
});
