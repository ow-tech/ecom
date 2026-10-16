import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const mock = vi.hoisted(() => ({ default: vi.fn(), supplier: vi.fn(), setDefault: vi.fn(), setSupplier: vi.fn(), clear: vi.fn() }));
vi.mock("../lib/api", () => ({ api: {
  platformDefaultCommission: mock.default, platformSupplierCommissionPolicy: mock.supplier,
  setPlatformDefaultCommission: mock.setDefault, setPlatformSupplierCommission: mock.setSupplier, clearPlatformSupplierCommission: mock.clear,
} }));
import { PlatformCommissionManagement } from "../components/platform-commission-management";
beforeEach(() => {
  mock.default.mockResolvedValue({ current: { rate: "0.100000", source: "ENV_DEFAULT" }, history: [] });
  mock.supplier.mockResolvedValue({ supplierId: "s-1", rate: "0.175000", source: "SUPPLIER", defaultRate: "0.100000", history: [] });
  mock.setDefault.mockResolvedValue({});
  mock.setSupplier.mockResolvedValue({});
  mock.clear.mockResolvedValue({});
  vi.stubGlobal("confirm", vi.fn(() => true));
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
describe("platform commission administration", () => {
  it("shows current fallback and supplier override separately", async () => {
    render(<PlatformCommissionManagement supplierId="s-1" canAdjust={false} />);
    expect(await screen.findByText("17.5%")).toBeTruthy();
    expect(screen.getByText("10%")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save platform default" })).toBeNull();
    expect(mock.setDefault).not.toHaveBeenCalled();
  });
  it("saves a new default using a rate fraction rather than percent", async () => {
    render(<PlatformCommissionManagement supplierId="" canAdjust />);
    const field = await screen.findByLabelText("New default commission (%)");
    await userEvent.clear(field); await userEvent.type(field, "12.5");
    await userEvent.click(screen.getByRole("button", { name: "Save platform default" }));
    await waitFor(() => expect(mock.setDefault).toHaveBeenCalledWith("0.125000"));
  });
  it("sets supplier-specific override and can revert to platform fallback", async () => {
    render(<PlatformCommissionManagement supplierId="s-1" canAdjust />);
    const field = await screen.findByLabelText("Supplier commission (%)");
    await userEvent.clear(field); await userEvent.type(field, "8.75");
    await userEvent.click(screen.getByRole("button", { name: "Set supplier rate" }));
    await waitFor(() => expect(mock.setSupplier).toHaveBeenCalledWith("s-1", "0.087500"));
    await userEvent.click(screen.getByRole("button", { name: "Use platform default" }));
    await waitFor(() => expect(mock.clear).toHaveBeenCalledWith("s-1"));
  });
  it("rejects a zero default rate before any mutation", async () => {
    render(<PlatformCommissionManagement supplierId="" canAdjust />);
    const field = await screen.findByLabelText("New default commission (%)");
    await userEvent.clear(field); await userEvent.type(field, "0");
    await userEvent.click(screen.getByRole("button", { name: "Save platform default" }));
    expect(mock.setDefault).not.toHaveBeenCalled();
    expect(screen.getByText(/greater than zero/)).toBeTruthy();
  });
});
