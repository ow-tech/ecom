import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

const mocks = vi.hoisted(() => ({
  api: { platformListings: vi.fn() },
  session: { id: "platform-user", platformPermissions: ["platform.products.read"] } as any,
}));
vi.mock("../lib/api", () => ({ api: mocks.api, ApiError: class ApiError extends Error {} }));
vi.mock("../components/session-provider", () => ({ useSession: () => ({ session: mocks.session }) }));

import { PlatformWorkspace } from "../components/platform-workspace";

const listing = { id: "listing-a", supplier: { id: "supplier-a", displayName: "Supplier A" }, product: { id: "product-a", name: "Phone" }, productVariant: { id: "variant-a", name: "Blue" }, price: "12.50", currencyCode: "USD", status: "ACTIVE", availability: "IN_STOCK", updatedAt: "2026-10-08T00:00:00.000Z" };
afterEach(() => { cleanup(); vi.clearAllMocks(); mocks.session = { id: "platform-user", platformPermissions: ["platform.products.read"] }; });

describe("PlatformWorkspace listings", () => {
  it("uses the dedicated platform listing contract for filters and pagination", async () => {
    mocks.api.platformListings.mockImplementation((query: any) => Promise.resolve({ data: query.page === 2 ? [{ ...listing, id: "listing-b", product: { id: "product-b", name: "Laptop" } }] : [listing], page: query.page, limit: 25, total: 26 }));
    render(<PlatformWorkspace section="listings" />);
    expect(await screen.findByText("Supplier A")).toBeTruthy();
    await userEvent.type(screen.getByLabelText("Search listings"), "phone");
    await waitFor(() => expect(mocks.api.platformListings).toHaveBeenLastCalledWith(expect.objectContaining({ search: "phone", page: 1 })));
    await userEvent.selectOptions(screen.getByLabelText("Listing status"), "ACTIVE");
    await waitFor(() => expect(mocks.api.platformListings).toHaveBeenLastCalledWith(expect.objectContaining({ search: "phone", status: "ACTIVE", page: 1 })));
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(mocks.api.platformListings).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })));
    expect(await screen.findByText("Laptop")).toBeTruthy();
  });

  it("does not render the oversight route for a platform user without the read permission", () => {
    mocks.session = { id: "limited", platformPermissions: [] };
    render(<PlatformWorkspace section="listings" />);
    expect(screen.getByText("Permission denied")).toBeTruthy();
    expect(mocks.api.platformListings).not.toHaveBeenCalled();
  });
});
