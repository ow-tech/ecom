import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import type { ReactNode } from "react";

const mocks = vi.hoisted(() => ({
  api: {
    supplierOverview: vi.fn(), inventory: vi.fn(), supplierOrders: vi.fn(),
    supplierProductSelection: vi.fn(), supplierListings: vi.fn(), createSupplierListing: vi.fn(),
    inventoryLocations: vi.fn(), stock: vi.fn(), removeStock: vi.fn(),
    fulfil: vi.fn(), supplierOrder: vi.fn(),
    supplierCommissionPolicy: vi.fn(), supplierFinanceBalance: vi.fn(), supplierLedger: vi.fn(), supplierCommissions: vi.fn(), supplierSettlements: vi.fn(), supplierSettlement: vi.fn(),
  },
  session: null as { organizations: Array<{ id: string; permissions: string[] }> } | null,
}));
const { api } = mocks;

vi.mock("../lib/api", () => ({ api: mocks.api, ApiError: class ApiError extends Error {} }));
vi.mock("../components/session-provider", () => ({ useSession: () => ({ session: mocks.session }) }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a> }));

import { SupplierWorkspace } from "../components/supplier-workspace";

const overview = (activeListings = 2) => ({ activeListings, stockAttention: 1, preparing: 3, ready: 4 });
const pickupOrder = (status = "READY_FOR_PICKUP") => ({ id: "pickup-order-1", status, currencyCode: "USD", items: [{ id: "item-1", productNameSnapshot: "Collection item", quantity: 1, lineTotal: "10.00" }], order: { orderNumber: "SO-PICKUP-1", fulfillmentMethod: "PICKUP", paymentStatus: "PAID" }, statusHistory: [] });
const renderPickup = async (permissions = ["orders.read", "fulfilment.update"], order = pickupOrder()) => {
  mocks.session = { organizations: [{ id: "a", permissions }] };
  api.supplierOrders.mockResolvedValue([order]); api.supplierOrder.mockResolvedValue({ ...order, status: "COMPLETED" });
  render(<SupplierWorkspace organizationId="a" section="orders" />);
  await userEvent.click(await screen.findByRole("button", { name: "Details" }));
};
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("SupplierWorkspace", () => {
  it("renders real overview metrics, omits permission-limited metrics, and retries a failed request", async () => {
    mocks.session = { organizations: [{ id: "a", permissions: ["inventory.read"] }] };
    api.supplierOverview.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ activeListings: null, stockAttention: 1, preparing: null, ready: null });
    api.inventory.mockResolvedValue({ data: [] }); api.supplierOrders.mockResolvedValue([]);
    render(<SupplierWorkspace organizationId="a" section="overview" />);
    expect((await screen.findByRole("alert")).textContent).toContain("We could not complete that request. Please retry.");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Stock attention")).toBeTruthy();
    expect(screen.queryByText("Active listings")).toBeNull();
  });

  it("links each authorized supplier KPI to filtered actionable records", async () => {
    mocks.session = { organizations: [{ id: "a", permissions: ["catalogue.listings.read", "inventory.read", "orders.read", "fulfilment.update"] }] };
    api.supplierOverview.mockResolvedValue(overview());
    api.inventory.mockResolvedValue({ data: [] });
    api.supplierOrders.mockResolvedValue([]);
    render(<SupplierWorkspace organizationId="a" section="overview" />);
    const listing = await screen.findByRole("link", { name: /Active listings: 2/i });
    expect(listing.getAttribute("href")).toBe("/supplier/a/listings?status=ACTIVE");
    expect(screen.getByRole("link", { name: /Stock attention: 1/i }).getAttribute("href")).toBe("/supplier/a/inventory?view=ATTENTION");
    expect(screen.getByRole("link", { name: /Orders to prepare: 3/i }).getAttribute("href")).toBe("/supplier/a/orders?status=PREPARING");
    expect(screen.getByRole("link", { name: /Ready for handover: 4/i }).getAttribute("href")).toBe("/supplier/a/fulfilment?status=READY");
  });

  it("keeps the newly selected organization when its older delayed request resolves last", async () => {
    mocks.session = { organizations: [{ id: "a", permissions: ["catalogue.listings.read"] }, { id: "b", permissions: ["inventory.read"] }] };
    let resolveA!: (value: ReturnType<typeof overview>) => void;
    const delayedA = new Promise<ReturnType<typeof overview>>((resolve) => { resolveA = resolve; });
    api.supplierOverview.mockImplementation((id: string) => id === "a" ? delayedA : Promise.resolve({ activeListings: null, stockAttention: 8, preparing: null, ready: null }));
    api.inventory.mockResolvedValue({ data: [] }); api.supplierOrders.mockResolvedValue([]);
    const view = render(<SupplierWorkspace organizationId="a" section="overview" />);
    view.rerender(<SupplierWorkspace organizationId="b" section="overview" />);
    expect(await screen.findByText("8")).toBeTruthy();
    resolveA(overview(99));
    await waitFor(() => expect(screen.queryByText("99")).toBeNull());
    expect(screen.getByText("8")).toBeTruthy();
  });

  it("paginates finance ledger results without deriving balances from a page and ignores an old organization response", async () => {
    mocks.session = { organizations: [{ id: "a", permissions: ["finance.read"] }, { id: "b", permissions: ["finance.read"] }] };
    api.supplierFinanceBalance.mockImplementation((id: string) => Promise.resolve({ balances: [{ currencyCode: "USD", balance: id === "a" ? "1000.00" : "7.00" }] }));
    let resolveA!: (value: { data: any[]; page: number; limit: number; total: number }) => void;
    const delayedA = new Promise<{ data: any[]; page: number; limit: number; total: number }>((resolve) => { resolveA = resolve; });
    api.supplierLedger.mockImplementation((id: string, query: { page: number }) => id === "a" && query.page === 1 ? delayedA : Promise.resolve({ data: [{ id: `${id}-${query.page}`, createdAt: "2040-01-01T00:00:00.000Z", type: "SUPPLIER_EARNING", referenceType: "TEST", referenceId: "r", amountSigned: "7.00", currencyCode: "USD" }], page: query.page, limit: 25, total: query.page === 1 ? 26 : 26 }));
    api.supplierCommissionPolicy.mockResolvedValue({ supplierId: "supplier-test", rate: "0.100000", defaultRate: "0.100000", source: "ENV_DEFAULT", history: [] });
    api.supplierCommissions.mockResolvedValue([]); api.supplierSettlements.mockResolvedValue([]);
    const view = render(<SupplierWorkspace organizationId="a" section="finance" />);
    view.rerender(<SupplierWorkspace organizationId="b" section="finance" />);
    expect(await screen.findByText("Page 1 · 26 total entries")).toBeTruthy(); expect(screen.getAllByText("$7.00")).toHaveLength(2);
    resolveA({ data: [{ id: "old", createdAt: "2040-01-01T00:00:00.000Z", type: "SUPPLIER_EARNING", amountSigned: "999.00", currencyCode: "USD" }], page: 1, limit: 25, total: 1 });
    await waitFor(() => expect(screen.queryByText("$999.00")).toBeNull());
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(api.supplierLedger).toHaveBeenCalledWith("b", { page: 2 }));
    expect(await screen.findByText("Page 2 · 26 total entries")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Previous" }));
    await waitFor(() => expect(api.supplierLedger).toHaveBeenCalledWith("b", { page: 1 }));
  });

  it("searches and selects a product then creates a listing with its selected variant", async () => {
    mocks.session = { organizations: [{ id: "a", permissions: ["catalogue.listings.read", "catalogue.listings.create"] }] };
    api.supplierListings.mockResolvedValue({ data: [] });
    api.supplierProductSelection.mockImplementation((_id: string, query: { search?: string }) => Promise.resolve({ data: query.search ? [{ id: "p1", name: "Phone", slug: "phone", variants: [{ id: "v1", name: "Blue", sku: "B" }] }] : [] }));
    api.createSupplierListing.mockResolvedValue({});
    render(<SupplierWorkspace organizationId="a" section="listings" />);
    const search = await screen.findByLabelText("Search platform products");
    await userEvent.type(search, "Phone"); await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await userEvent.click(await screen.findByText("Phone"));
    await userEvent.selectOptions(screen.getByLabelText("Variant"), "v1");
    await userEvent.type(screen.getByLabelText("Price"), "12.50"); await userEvent.type(screen.getByLabelText("Currency"), "USD");
    await userEvent.click(screen.getByRole("button", { name: "Create draft listing" }));
    await waitFor(() => expect(api.createSupplierListing).toHaveBeenCalledWith("a", expect.objectContaining({ productId: "p1", productVariantId: "v1", price: "12.50", currencyCode: "USD" })));
  });

  it("requires a manual-adjustment reason, refreshes after a conflict, and hides mutation controls without permission", async () => {
    const item = { id: "i1", onHand: 3, reserved: 1, available: 2, supplierListing: { id: "l1", supplierSku: "SKU" }, inventoryLocation: { name: "Main" } };
    mocks.session = { organizations: [{ id: "a", permissions: ["inventory.read", "inventory.adjust"] }] };
    api.inventory.mockResolvedValue({ data: [item], total: 1 }); api.inventoryLocations.mockResolvedValue([]); api.stock.mockRejectedValue(new Error("conflict"));
    render(<SupplierWorkspace organizationId="a" section="inventory" />);
    await userEvent.click(await screen.findByRole("button", { name: "Adjust" }));
    await userEvent.type(screen.getByLabelText("Adjustment delta"), "1");
    await userEvent.click(screen.getByRole("button", { name: "Apply adjustment" }));
    expect(api.stock).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText("Reason"), "count correction");
    vi.stubGlobal("confirm", () => true);
    await userEvent.click(screen.getByRole("button", { name: "Apply adjustment" }));
    await waitFor(() => expect(api.inventory).toHaveBeenCalledTimes(2));
    mocks.session = { organizations: [{ id: "a", permissions: ["inventory.read"] }] };
    cleanup(); render(<SupplierWorkspace organizationId="a" section="inventory" />);
    expect(await screen.findByText("Stock overview")).toBeTruthy(); expect(screen.queryByRole("button", { name: "Adjust" })).toBeNull();
  });

  it("shows secure pickup completion only to an authorized supplier member for an eligible order", async () => {
    await renderPickup();
    expect(screen.getByText("Verify collection")).toBeTruthy();
    cleanup();
    await renderPickup(["orders.read"]);
    expect(screen.queryByText("Verify collection")).toBeNull();
    expect(screen.queryByRole("button", { name: "Complete pickup" })).toBeNull();
  });

  it("rejects a blank collection code without calling the backend", async () => {
    await renderPickup();
    await userEvent.type(screen.getByLabelText("Collection code"), "   ");
    await userEvent.click(screen.getByRole("button", { name: "Complete pickup" }));
    expect(screen.getByRole("alert").textContent).toContain("Enter the collection code");
    expect(api.fulfil).not.toHaveBeenCalled();
  });

  it("submits the trimmed pickup code to its canonical order, disables while pending, reloads, and clears it", async () => {
    let resolve!: () => void;
    api.fulfil.mockImplementationOnce(() => new Promise<void>((done) => { resolve = done; }));
    await renderPickup();
    const code = screen.getByLabelText("Collection code");
    await userEvent.type(code, " 12345678 ");
    await userEvent.click(screen.getByRole("button", { name: "Complete pickup" }));
    expect(api.fulfil).toHaveBeenCalledWith("a", "pickup-order-1", "complete-pickup", { collectionCode: "12345678" });
    expect((screen.getByRole("button", { name: /Complete pickup/ }) as HTMLButtonElement).disabled).toBe(true);
    resolve();
    await waitFor(() => expect(api.supplierOrder).toHaveBeenCalledWith("a", "pickup-order-1"));
    await waitFor(() => expect(screen.queryByLabelText("Collection code")).toBeNull());
  });

  it("shows a safe error for a rejected pickup code without locally completing the order", async () => {
    api.fulfil.mockRejectedValueOnce(new Error("rejected 87654321"));
    await renderPickup();
    await userEvent.type(screen.getByLabelText("Collection code"), "87654321");
    await userEvent.click(screen.getByRole("button", { name: "Complete pickup" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("We could not complete that request"));
    expect(screen.queryByText("Completed")).toBeNull();
    expect(screen.getByRole("alert").textContent).not.toContain("87654321");
  });

  it("refreshes after an already-completed conflict without faking a second completion", async () => {
    api.fulfil.mockRejectedValueOnce({ status: 409, message: "already completed" });
    await renderPickup();
    await userEvent.type(screen.getByLabelText("Collection code"), "12345678");
    await userEvent.click(screen.getByRole("button", { name: "Complete pickup" }));
    await waitFor(() => expect(api.supplierOrder).toHaveBeenCalledWith("a", "pickup-order-1"));
    expect(screen.getByText("COMPLETED")).toBeTruthy();
    expect(api.fulfil).toHaveBeenCalledTimes(1);
  });

  it("keeps pickup codes out of browser storage, URLs, and logging", async () => {
    const log = vi.spyOn(console, "log"); const warn = vi.spyOn(console, "warn"); const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    api.fulfil.mockResolvedValueOnce({});
    await renderPickup();
    await userEvent.type(screen.getByLabelText("Collection code"), "12345678");
    await userEvent.click(screen.getByRole("button", { name: "Complete pickup" }));
    await waitFor(() => expect(api.fulfil).toHaveBeenCalled());
    expect(localStorage.getItem("collectionCode")).toBeNull(); expect(sessionStorage.getItem("collectionCode")).toBeNull();
    expect(window.location.search).not.toContain("12345678");
    expect(log).not.toHaveBeenCalled(); expect(warn).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
  });
});
