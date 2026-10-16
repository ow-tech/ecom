import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const mocks = vi.hoisted(() => ({ supplierReport: vi.fn() }));
vi.mock("../lib/api", () => ({ api: mocks }));
import { SupplierReports } from "../components/supplier-reports";
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const report = { period: { label: "Last 30 days", since: new Date().toISOString() },
  overview: { activeListings: 22, stockAttention: 2, preparing: 2, ready: 2 },
  orderStatuses: [{ status: "READY_FOR_PICKUP", count: 2 }],
  paidMerchandise: [{ currencyCode: "USD", paidSupplierOrders: 26, subtotal: "260.00" }] };
describe("supplier reporting visibility", () => {
  it("renders canonical counts and currency-separated paid merchandise", async () => {
    mocks.supplierReport.mockResolvedValue(report);
    render(<SupplierReports organizationId="org-a"/>);
    expect(await screen.findByText("Gross paid merchandise")).toBeTruthy();
    expect(screen.getByText("26 paid supplier orders · USD")).toBeTruthy();
    expect(screen.getByText("Stock attention")).toBeTruthy();
    expect(mocks.supplierReport).toHaveBeenCalledWith("org-a");
    await userEvent.click(screen.getByRole("button", { name: "Refresh report" }));
    await waitFor(() => expect(mocks.supplierReport).toHaveBeenCalledTimes(2));
  });
  it("omits unauthorized financial and order status sections instead of rendering fake zeros", async () => {
    mocks.supplierReport.mockResolvedValue({ ...report, orderStatuses: null, paidMerchandise: null });
    render(<SupplierReports organizationId="org-a"/>);
    expect(await screen.findByText("Active listings")).toBeTruthy();
    expect(screen.queryByText("Gross paid merchandise")).toBeNull();
    expect(screen.queryByText("Supplier order status")).toBeNull();
  });
  it("does not display stale reports after a failed request", async () => {
    mocks.supplierReport.mockRejectedValueOnce(new Error("Try again"));
    render(<SupplierReports organizationId="org-a"/>);
    expect(await screen.findByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.queryByText("Gross paid merchandise")).toBeNull();
  });
});
