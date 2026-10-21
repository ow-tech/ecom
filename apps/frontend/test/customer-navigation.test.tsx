import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("../components/storefront-header", () => ({
  StorefrontHeader: () => <header><nav aria-label="Storefront">Persistent storefront navigation</nav></header>,
}));
import { CustomerNavigation } from "../components/customer-navigation";

afterEach(() => { cleanup(); mocks.pathname = "/"; });

describe("persistent customer navigation boundary", () => {
  it.each(["/", "/products", "/products/phone", "/categories/electronics", "/account",
    "/account/addresses", "/account/orders/123/after-sales", "/account/support/new",
    "/cart", "/checkout", "/checkout/payment/order-123", "/login", "/register", "/forgot-password"])(
    "renders the shared storefront navbar at %s", pathname => {
      mocks.pathname = pathname;
      render(<CustomerNavigation />);
      expect(screen.getAllByRole("navigation", { name: "Storefront" })).toHaveLength(1);
    },
  );

  it.each(["/platform", "/platform/payments", "/supplier", "/supplier/organization/orders", "/staff/login", "/staff/invitation"])(
    "does not duplicate the dedicated workforce navigation at %s", pathname => {
      mocks.pathname = pathname;
      render(<CustomerNavigation />);
      expect(screen.queryByRole("navigation", { name: "Storefront" })).toBeNull();
    },
  );

  it("keeps a single navbar as the customer navigates between nested pages", () => {
    const view = render(<CustomerNavigation />);
    mocks.pathname = "/account";
    view.rerender(<CustomerNavigation />);
    mocks.pathname = "/account/orders";
    view.rerender(<CustomerNavigation />);
    mocks.pathname = "/products";
    view.rerender(<CustomerNavigation />);
    expect(screen.getAllByRole("navigation", { name: "Storefront" })).toHaveLength(1);
  });
});
