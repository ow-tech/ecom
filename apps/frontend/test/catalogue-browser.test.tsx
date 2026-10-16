import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

const mocks = vi.hoisted(() => ({ query: "category=phones&q=wireless&page=2", push: vi.fn(), replace: vi.fn(), categories: vi.fn(), products: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/products", useRouter: () => ({ push: mocks.push, replace: mocks.replace }), useSearchParams: () => new URLSearchParams(mocks.query) }));
vi.mock("../lib/catalogue", () => ({ catalogue: { getCategories: (...args: unknown[]) => mocks.categories(...args), getProducts: (...args: unknown[]) => mocks.products(...args) } }));

import { CatalogueBrowser } from "../components/catalogue-browser";
import { BrandedSelect } from "../components/ui";
import { resolveCategoryTheme } from "../lib/category-theme";

const scrollIntoView = vi.fn();
Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { value: scrollIntoView, configurable: true });
Object.defineProperty(HTMLElement.prototype, "scrollBy", { value: vi.fn(), configurable: true });

const categories = [{ id: "category-123", name: "Phones", slug: "phones", description: null, parentId: null }, { id: "category-456", name: "Beauty", slug: "beauty", description: null, parentId: null }];
const page = (name: string) => ({ data: [{ id: name, name, slug: name.toLowerCase().replaceAll(" ", "-"), brand: null, category: { id: "category-123", name: "Phones", slug: "phones" }, image: null, offerCount: 1, offers: [{ id: `${name}-offer`, price: "10.00", currencyCode: "USD", variantId: null, variant: null, availability: "IN_STOCK" as const, supplier: { slug: "supplier-a", name: "Supplier A" } }] }], page: 1, limit: 24, total: 1, filters: { suppliers: [{ slug: "supplier-a", name: "Supplier A" }], currencies: ["USD"] } });
const deferred = <T,>() => { let resolve!: (value: T) => void; return { promise: new Promise<T>(done => { resolve = done; }), resolve }; };

afterEach(() => { cleanup(); vi.clearAllMocks(); mocks.query = "category=phones&q=wireless&page=2"; mocks.categories.mockResolvedValue(categories); mocks.products.mockResolvedValue(page("Initial product")); });

describe("CatalogueBrowser", () => {
  it("uses the route slug for selected category semantics and never scrolls the document", async () => {
    mocks.categories.mockResolvedValue(categories); mocks.products.mockResolvedValue(page("Initial product"));
    render(<CatalogueBrowser />);
    const phones = await screen.findByRole("link", { name: "Phones" });
    expect(phones.getAttribute("aria-current")).toBe("page");
    expect(phones.getAttribute("href")).toBe("/products?category=phones&q=wireless");
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("selects All products when the category query is absent", async () => {
    mocks.query = "q=wireless";
    mocks.categories.mockResolvedValue(categories); mocks.products.mockResolvedValue(page("Initial product"));
    render(<CatalogueBrowser />);
    expect((await screen.findByRole("link", { name: "All products" })).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Phones" }).getAttribute("aria-current")).toBeNull();
  });

  it("builds category destinations with preserved filters, resets page, and highlights optimistically", async () => {
    mocks.query = "category=phones&q=wireless&supplier=supplier-a&page=3";
    mocks.categories.mockResolvedValue(categories); mocks.products.mockResolvedValue(page("Initial product"));
    render(<CatalogueBrowser />);
    const beauty = await screen.findByRole("link", { name: "Beauty" });
    expect(beauty.getAttribute("href")).toBe("/products?category=beauty&q=wireless&supplier=supplier-a");
    beauty.addEventListener("click", event => event.preventDefault(), { once: true });
    await userEvent.click(beauty);
    expect(beauty.getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Phones" }).getAttribute("aria-current")).toBeNull();
  });

  it("preserves category and search while filter changes reset page, and exposes invalid price bounds", async () => {
    mocks.categories.mockResolvedValue(categories); mocks.products.mockResolvedValue(page("Initial product"));
    render(<CatalogueBrowser />);
    await screen.findByText("Initial product");
    await userEvent.click(screen.getAllByRole("combobox", { name: "Supplier" })[0]);
    await userEvent.click(await screen.findByRole("option", { name: "Supplier A" }));
    await waitFor(() => expect(mocks.push).toHaveBeenLastCalledWith("/products?category=phones&q=wireless&supplier=supplier-a"));
    mocks.query = "category=phones&q=wireless&currency=USD&minPrice=20&maxPrice=10";
    render(<CatalogueBrowser />);
    expect((await screen.findByRole("alert")).textContent).toContain("Minimum price cannot exceed maximum price.");
    await userEvent.click(screen.getAllByRole("button", { name: /Filters/ }).at(-1)!);
    expect(screen.getByRole("dialog", { name: "Product filters" })).toBeTruthy();
  });

  it("keeps the latest catalogue response when an older request resolves later", async () => {
    const old = deferred<ReturnType<typeof page>>(); const newer = deferred<ReturnType<typeof page>>();
    mocks.categories.mockResolvedValue(categories); mocks.products.mockReturnValueOnce(old.promise).mockReturnValueOnce(newer.promise);
    const rendered = render(<CatalogueBrowser />);
    mocks.query = "category=phones&supplier=supplier-a";
    rendered.rerender(<CatalogueBrowser />);
    newer.resolve(page("New product"));
    expect(await screen.findByText("New product")).toBeTruthy();
    old.resolve(page("Old product"));
    await Promise.resolve(); await Promise.resolve();
    expect(screen.queryByText("Old product")).toBeNull();
  });

  it("retains the previous grid while a new category request is pending", async () => {
    const pending = deferred<ReturnType<typeof page>>();
    mocks.categories.mockResolvedValue(categories); mocks.products.mockResolvedValueOnce(page("Previous product")).mockReturnValueOnce(pending.promise);
    const rendered = render(<CatalogueBrowser />);
    expect(await screen.findByText("Previous product")).toBeTruthy();
    mocks.query = "category=beauty&q=wireless";
    rendered.rerender(<CatalogueBrowser />);
    expect(screen.getByText("Previous product")).toBeTruthy();
    expect(screen.getByText("Updating products…")).toBeTruthy();
    pending.resolve(page("Beauty product"));
    expect(await screen.findByText("Beauty product")).toBeTruthy();
  });
});

describe("BrandedSelect", () => {
  it("renders its selected option in a locally anchored menu and supports keyboard selection", async () => {
    const change = vi.fn();
    render(<BrandedSelect label="Sort products" value="newest" onChange={change} placeholder="Choose" options={[{ value: "newest", label: "Newest" }, { value: "name-asc", label: "Name A–Z" }]} />);
    const trigger = screen.getByRole("combobox", { name: "Sort products" });
    expect(trigger.textContent).toContain("Newest");
    await userEvent.click(trigger);
    const listbox = screen.getByRole("listbox", { name: "Sort products" });
    expect(listbox.parentElement).toBe(trigger.parentElement);
    expect(screen.getByRole("option", { name: /Newest/ }).getAttribute("aria-selected")).toBe("true");
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(change).toHaveBeenCalledWith("name-asc");
    expect(document.activeElement).toBe(trigger);
    expect(screen.queryByRole("listbox", { name: "Sort products" })).toBeNull();
  });

  it("closes on Escape and outside interaction", async () => {
    render(<div><BrandedSelect label="Supplier" value="" onChange={vi.fn()} placeholder="All suppliers" options={[{ value: "", label: "All suppliers" }]} /><button type="button">Outside</button></div>);
    const trigger = screen.getByRole("combobox", { name: "Supplier" });
    await userEvent.click(trigger);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("listbox", { name: "Supplier" })).toBeNull();
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("listbox", { name: "Supplier" })).toBeNull();
  });
});

describe("resolveCategoryTheme", () => {
  it("maps known categories to brand tokens and gives unknown categories a stable fallback", () => {
    expect(resolveCategoryTheme("phones").accent).toBe("var(--category-tech)");
    expect(resolveCategoryTheme("beauty").accent).toBe("var(--category-beauty)");
    expect(resolveCategoryTheme("business-services").accent).toBe("var(--category-business)");
    expect(resolveCategoryTheme("future-category")).toEqual(resolveCategoryTheme("future-category"));
    expect(resolveCategoryTheme("future-category").accent).toMatch(/^var\(--category-/);
  });
});
