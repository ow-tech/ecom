import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ProductGrid } from "../components/catalogue-browser";
import type { CatalogueProduct, CatalogueProductPage } from "../lib/api";

afterEach(cleanup);
function product(id: string, name: string): CatalogueProduct {
  return {
    id, name, slug: id, brand: null,
    category: { id: "category", name: "Electronics", slug: "electronics" },
    image: null, offerCount: 1,
    offers: [{ id: `offer-${id}`, price: "220.00", currencyCode: "KES", supplier: { slug: "seller", name: "Seller" },
      origin: "LOCAL", availability: "IN_STOCK", variantId: null, variant: null }],
  } as CatalogueProduct;
}

describe("responsive five-across product catalogue", () => {
  it("uses five columns on wide screens and aligns cards with varying title lengths", () => {
    const page = { data: [
      product("one", "Laptop"),
      product("two", "A full-length product name that is much longer than most cards"),
      product("three", "Phone"),
      product("four", "Accessories"),
      product("five", "Headphones"),
    ], total: 5, page: 1, limit: 24, filters: { suppliers: [], currencies: ["KES"] } } as CatalogueProductPage;
    const { container } = render(<ProductGrid page={page} />);
    const grid = container.querySelector(".grid");
    expect(grid?.className).toContain("xl:grid-cols-5");
    expect(grid?.className).toContain("items-stretch");
    expect(container.querySelectorAll("article")).toHaveLength(5);
    for (const card of container.querySelectorAll("article")) {
      expect(card.className).toContain("h-full");
      expect(card.querySelector("a")?.className).toContain("flex-col");
    }
    expect(screen.getByRole("link", { name: "View Laptop" }).getAttribute("href")).toBe("/products/one");
    expect(screen.getByRole("heading", { name: /full-length product name/ }).className).toContain("line-clamp-2");
  });
});
