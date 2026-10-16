import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const mocks = vi.hoisted(() => ({ api: {
  platformSuppliers: vi.fn(), platformFinanceSettlements: vi.fn(), platformFinanceSupplierBalance: vi.fn(),
  createPlatformSettlement: vi.fn(), approvePlatformSettlement: vi.fn(), markPlatformSettlementPaid: vi.fn(),
} }));
vi.mock("../lib/api", () => ({ api: mocks.api }));
import { PlatformFinanceManagement } from "../components/platform-finance-management";
const draft = { id: "settlement-one", supplierId: "supplier-one", status: "DRAFT", currencyCode: "KES", netAmount: "500.00" };
const approved = { ...draft, status: "APPROVED" };
beforeEach(() => {
  mocks.api.platformSuppliers.mockResolvedValue({ data: [{ id: "supplier-one", displayName: "Supplier One" }] });
  mocks.api.platformFinanceSettlements.mockResolvedValue([draft]);
  mocks.api.platformFinanceSupplierBalance.mockResolvedValue({ supplierId: "supplier-one", balances: [{ currencyCode: "KES", balance: "500.00" }] });
  mocks.api.createPlatformSettlement.mockResolvedValue({ ...draft, id: "new" });
  mocks.api.approvePlatformSettlement.mockResolvedValue({ status: "APPROVED" });
  mocks.api.markPlatformSettlementPaid.mockResolvedValue({ status: "PAID" });
  vi.stubGlobal("confirm", vi.fn(() => true));
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
describe("platform financial settlement operations", () => {
  it("hides financial data from users without platform finance read permission", () => {
    render(<PlatformFinanceManagement permissions={[]}/>);
    expect(screen.getByText("Permission denied")).toBeTruthy();
    expect(mocks.api.platformFinanceSettlements).not.toHaveBeenCalled();
  });
  it("exposes supplier balances and settlement history but no mutations to read-only users", async () => {
    render(<PlatformFinanceManagement permissions={["platform.finance.read"]}/>);
    expect(await screen.findByText("Settlement history")).toBeTruthy();
    await userEvent.selectOptions(screen.getByLabelText("Supplier"), "supplier-one");
    await waitFor(() => expect(mocks.api.platformFinanceSupplierBalance).toHaveBeenCalledWith("supplier-one"));
    expect(screen.queryByRole("button", { name: "Create draft settlement" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Approve settlement" })).toBeNull();
  });
  it("uses server-owned values for draft creation", async () => {
    render(<PlatformFinanceManagement permissions={["platform.finance.read", "platform.settlements.manage"]}/>);
    await screen.findByText("Settlement history");
    await userEvent.selectOptions(screen.getByLabelText("Supplier"), "supplier-one");
    await userEvent.click(screen.getByRole("button", { name: "Create draft settlement" }));
    await waitFor(() => expect(mocks.api.createPlatformSettlement).toHaveBeenCalledWith("supplier-one", "KES"));
    expect(mocks.api.createPlatformSettlement.mock.calls[0]).toHaveLength(2);
  });
  it("requires external payment reference and user confirmation before paid acknowledgment", async () => {
    mocks.api.platformFinanceSettlements.mockResolvedValue([approved]);
    render(<PlatformFinanceManagement permissions={["platform.finance.read", "platform.settlements.manage"]}/>);
    await screen.findByText("Settlement history");
    await userEvent.click(screen.getByRole("button", { name: "Record externally paid" }));
    expect(screen.getByRole("button", { name: "Acknowledge externally paid" }).hasAttribute("disabled")).toBe(true);
    await userEvent.type(screen.getByLabelText("External payment reference"), "bank-12345");
    vi.stubGlobal("confirm", vi.fn(() => false));
    await userEvent.click(screen.getByRole("button", { name: "Acknowledge externally paid" }));
    expect(mocks.api.markPlatformSettlementPaid).not.toHaveBeenCalled();
    vi.stubGlobal("confirm", vi.fn(() => true));
    await userEvent.click(screen.getByRole("button", { name: "Acknowledge externally paid" }));
    await waitFor(() => expect(mocks.api.markPlatformSettlementPaid).toHaveBeenCalledWith("settlement-one", "bank-12345", ""));
  });
});
