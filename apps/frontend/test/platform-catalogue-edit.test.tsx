import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const mocks = vi.hoisted(() => ({ api: {
  platformCategories: vi.fn(), updatePlatformCategory: vi.fn(),
  platformProducts: vi.fn(), updatePlatformProduct: vi.fn(),
  platformVariants: vi.fn(), updatePlatformVariant: vi.fn(),
  platformMedia: vi.fn(), updatePlatformMedia: vi.fn(),
} }));
vi.mock("../lib/api", () => ({ api: mocks.api }));
import { PlatformCatalogueEdit } from "../components/platform-catalogue-edit";

const category = { id: "cat-one", name: "Electronics", status: "ACTIVE", description: "Gadgets" };
const product = { id: "product-one", name: "Laptop", categoryId: "cat-one", status: "ACTIVE", brand: "Test", description: "Old" };
const variant = { id: "variant-one", name: "Blue", sku: "BLUE", status: "ACTIVE", attributes: { color: "blue" } };
const media = { id: "media-one", storageKey: "products/one", altText: "Front", url: "https://example.test/front.webp", sortOrder: 0 };

beforeEach(() => {
  mocks.api.platformCategories.mockResolvedValue([category]);
  mocks.api.platformProducts.mockResolvedValue({ data: [product], page: 1, limit: 100, total: 1 });
  mocks.api.platformVariants.mockResolvedValue([variant]);
  mocks.api.platformMedia.mockResolvedValue([media]);
  for (const method of ["updatePlatformCategory", "updatePlatformProduct", "updatePlatformVariant", "updatePlatformMedia"] as const)
    mocks.api[method].mockResolvedValue({});
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("platform catalogue PATCH workflows", () => {
  it("provides no editor to a read-only user", () => {
    render(<PlatformCatalogueEdit mode="categories" permissions={["platform.categories.read"]}/>);
    expect(screen.queryByText("Edit category")).toBeNull();
    expect(mocks.api.platformCategories).not.toHaveBeenCalled();
  });
  it("updates existing category without editing immutable slug", async () => {
    render(<PlatformCatalogueEdit mode="categories" permissions={["platform.categories.read", "platform.categories.manage"]}/>);
    await screen.findByRole("option", { name: "Electronics" });
    await userEvent.selectOptions(screen.getByLabelText("Category to edit"), "cat-one");
    await userEvent.clear(screen.getByLabelText("Catalogue name"));
    await userEvent.type(screen.getByLabelText("Catalogue name"), "Electronics & Audio");
    await userEvent.click(screen.getByRole("button", { name: "Save category" }));
    await waitFor(() => expect(mocks.api.updatePlatformCategory).toHaveBeenCalledWith("cat-one", expect.objectContaining({ name: "Electronics & Audio" })));
    expect(mocks.api.updatePlatformCategory.mock.calls[0][1].slug).toBeUndefined();
  });
  it("updates product identity and variant through canonical scoped API", async () => {
    render(<PlatformCatalogueEdit mode="products" permissions={["platform.products.read", "platform.products.manage"]}/>);
    await screen.findByRole("option", { name: "Laptop" });
    await userEvent.selectOptions(screen.getByLabelText("Product to edit"), "product-one");
    await userEvent.clear(screen.getByLabelText("Catalogue name"));
    await userEvent.type(screen.getByLabelText("Catalogue name"), "Office Laptop");
    await userEvent.click(screen.getByRole("button", { name: "Save product" }));
    await waitFor(() => expect(mocks.api.updatePlatformProduct).toHaveBeenCalledWith("product-one", expect.objectContaining({ name: "Office Laptop", categoryId: "cat-one" })));
    await screen.findByRole("option", { name: "Blue" });
    await userEvent.selectOptions(screen.getByLabelText("Variant to edit"), "variant-one");
    await userEvent.click(screen.getByRole("button", { name: "Save variant" }));
    await waitFor(() => expect(mocks.api.updatePlatformVariant).toHaveBeenCalledWith("product-one", "variant-one", expect.objectContaining({ name: "Blue", attributes: { color: "blue" } })));
  });
  it("updates media metadata without a binary upload path", async () => {
    render(<PlatformCatalogueEdit mode="products" permissions={["platform.products.read", "platform.products.manage"]}/>);
    await screen.findByRole("option", { name: "Laptop" });
    await userEvent.selectOptions(screen.getByLabelText("Product to edit"), "product-one");
    await screen.findByRole("option", { name: "Front" });
    await userEvent.selectOptions(screen.getByLabelText("Media metadata to edit"), "media-one");
    await userEvent.clear(screen.getByLabelText("Media alt text"));
    await userEvent.type(screen.getByLabelText("Media alt text"), "Laptop facing front");
    await userEvent.click(screen.getByRole("button", { name: "Save media metadata" }));
    await waitFor(() => expect(mocks.api.updatePlatformMedia).toHaveBeenCalledWith("product-one", "media-one", expect.objectContaining({ altText: "Laptop facing front", sortOrder: 0 })));
  });
  it("preserves the error state when a PATCH fails", async () => {
    mocks.api.updatePlatformCategory.mockRejectedValueOnce(new Error("Not authorized"));
    render(<PlatformCatalogueEdit mode="categories" permissions={["platform.categories.read", "platform.categories.manage"]}/>);
    await screen.findByRole("option", { name: "Electronics" });
    await userEvent.selectOptions(screen.getByLabelText("Category to edit"), "cat-one");
    await userEvent.click(screen.getByRole("button", { name: "Save category" }));
    expect(await screen.findByText("Not authorized")).toBeTruthy();
    expect(screen.queryByText("Catalogue changes saved.")).toBeNull();
  });
});
