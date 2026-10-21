import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";

const mocks = vi.hoisted(() => ({ count: 3 }));
vi.mock("next/navigation", () => ({ usePathname: () => "/products", useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../components/session-provider", () => ({ useSession: () => ({ session: { id: "customer" }, loading: false }) }));
vi.mock("../components/cart-provider", () => ({ useCart: () => ({ count: mocks.count }) }));
vi.mock("../components/fly-to-cart", () => ({ FlyToCart: () => null }));
import { StorefrontHeader } from "../components/storefront-header";

afterEach(() => { cleanup(); vi.clearAllMocks(); mocks.count = 3; });
describe("StorefrontHeader", () => {
  it("keeps one accessible storefront navigation with a sticky cart icon and authoritative badge", () => {
    render(<StorefrontHeader />);
    const navigation = screen.getByRole("navigation", { name: "Storefront" });
    expect(navigation.parentElement?.className).toContain("sticky");
    expect(navigation.parentElement?.className).toContain("z-40");
    expect(navigation.className).toContain("flex-wrap");
    expect(screen.getByRole("link", { name: "Cart, 3 items" }).getAttribute("href")).toBe("/cart");
    expect(screen.getByLabelText("3 cart items").textContent).toBe("3");
    expect(screen.getByRole("link", { name: "Account" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Shop" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "Products" }).getAttribute("href")).toBe("/products");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });
});
