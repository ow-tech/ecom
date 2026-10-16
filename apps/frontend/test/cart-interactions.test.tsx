import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

const mocks = vi.hoisted(() => ({ replace: vi.fn(), clear: vi.fn(), cart: null as any }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("../components/session-provider", () => ({ useSession: () => ({ session: { id: "customer" }, loading: false }) }));
vi.mock("../components/cart-provider", () => ({ useCart: () => ({ cart: mocks.cart, loading: false, updateItem: vi.fn(), removeItem: vi.fn(), clear: mocks.clear }) }));
vi.mock("../components/storefront-header", () => ({ StorefrontHeader: () => <header>Cart header</header> }));

import CartPage from "../app/cart/page";

const cart = { id: "cart", currency: "USD", subtotal: "10.00", items: [{ id: "line", supplierListingId: "offer", quantity: 1, unitPrice: "10.00", currency: "USD", currentPrice: "10.00", availability: 2, eligible: true, productName: "Product", productSlug: "product", variantName: null, supplierName: "Supplier", image: null }] };
const deferred = <T,>() => { let resolve!: (value: T) => void; return { promise: new Promise<T>(done => { resolve = done; }), resolve }; };

afterEach(() => { cleanup(); vi.clearAllMocks(); sessionStorage.clear(); mocks.cart = cart; mocks.clear.mockResolvedValue(undefined); });
beforeEach(() => { mocks.cart = cart; mocks.clear.mockResolvedValue(undefined); });

describe("CartPage interactions", () => {
  it("uses only a saved internal products URL for the outlined Continue Shopping action", () => {
    sessionStorage.setItem("ecom:last-catalogue", "https://outside.example/products"); render(<CartPage />);
    const action = screen.getByRole("button", { name: "← Continue Shopping" });
    expect(action.className).toContain("border"); expect(action.closest("a")?.getAttribute("href")).toBe("/products");
    cleanup(); sessionStorage.setItem("ecom:last-catalogue", "/products?category=phones"); render(<CartPage />);
    expect(screen.getByRole("button", { name: "← Continue Shopping" }).closest("a")?.getAttribute("href")).toBe("/products?category=phones");
  });

  it("confirms clear, disables the mutation, and retains items with an error when it fails", async () => {
    const pending = deferred<void>(); mocks.clear.mockReturnValueOnce(pending.promise).mockRejectedValueOnce(new Error("Clear failed")); render(<CartPage />);
    await userEvent.click(screen.getByRole("button", { name: "Clear Cart" }));
    expect(screen.getByRole("dialog")).toBeTruthy(); await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" })); expect(mocks.clear).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Clear Cart" })); await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Clear Cart" }));
    expect(mocks.clear).toHaveBeenCalledTimes(1); expect((within(screen.getByRole("dialog")).getByRole("button", { name: /Clear Cart/ }) as HTMLButtonElement).disabled).toBe(true);
    pending.resolve(); await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await userEvent.click(screen.getByRole("button", { name: "Clear Cart" })); await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Clear Cart" }));
    expect(await screen.findByRole("alert")).toBeTruthy(); expect(screen.getByText("Product")).toBeTruthy();
  });
});
