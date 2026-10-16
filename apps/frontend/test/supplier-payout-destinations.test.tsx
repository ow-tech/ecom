import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const calls = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), disable: vi.fn() }));
vi.mock("../lib/api", () => ({
  api: {
    supplierPayoutDestinations: calls.list,
    createSupplierPayoutDestination: calls.create,
    disableSupplierPayoutDestination: calls.disable,
  },
}));
import { SupplierPayoutDestinations } from "../components/supplier-payout-destinations";

const stored = { id: "bank-one", supplierId: "supplier-one", type: "BANK", currencyCode: "KES", accountHolderName: "Supplier Ltd", bankName: "Example Bank", bankCountryCode: "KE", maskedLastFour: "3456", isActive: true, createdAt: "2026-10-16T12:00:00Z" };
beforeEach(() => {
  calls.list.mockResolvedValue([stored]);
  calls.create.mockResolvedValue(stored);
  calls.disable.mockResolvedValue({ id: "bank-one", isActive: false });
  vi.stubGlobal("confirm", vi.fn(() => true));
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe("supplier payout instructions", () => {
  it("shows only masked details to finance-read users", async () => {
    render(<SupplierPayoutDestinations organizationId="org-one" permissions={["finance.read"]}/>);
    expect(await screen.findByText(/ending 3456/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save payout destination" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Disable" })).toBeNull();
    expect(screen.queryByText("12345678903456")).toBeNull();
  });
  it("sends new bank details to the supplier-owned endpoint with no browser-side persistence", async () => {
    render(<SupplierPayoutDestinations organizationId="org-one" permissions={["finance.read", "organization.members.manage"]}/>);
    await screen.findByText(/ending 3456/);
    await userEvent.type(screen.getByLabelText("Account holder / registered name"), "Supplier Trading");
    await userEvent.type(screen.getByLabelText("Bank name"), "New Bank");
    await userEvent.type(screen.getByLabelText("IBAN (if supported)"), "GB82WEST12345698765432");
    await userEvent.type(screen.getByLabelText("SWIFT / BIC"), "ABCDEF12");
    await userEvent.click(screen.getByRole("button", { name: "Save payout destination" }));
    await waitFor(() => expect(calls.create).toHaveBeenCalledWith("org-one", expect.objectContaining({
      type: "BANK", currencyCode: "KES", iban: "GB82WEST12345698765432", swiftBic: "ABCDEF12",
    })));
  });
  it("supports M-Pesa in KES and disables existing destinations only after confirmation", async () => {
    render(<SupplierPayoutDestinations organizationId="org-one" permissions={["finance.read", "organization.members.manage"]}/>);
    await screen.findByText(/ending 3456/);
    await userEvent.selectOptions(screen.getByLabelText("Payout method"), "MPESA");
    await userEvent.type(screen.getByLabelText("Account holder / registered name"), "Mobile Owner");
    await userEvent.type(screen.getByLabelText("Registered M-Pesa phone"), "0712345678");
    await userEvent.click(screen.getByRole("button", { name: "Save payout destination" }));
    await waitFor(() => expect(calls.create).toHaveBeenCalledWith("org-one", expect.objectContaining({
      type: "MPESA", currencyCode: "KES", mpesaPhone: "0712345678",
    })));
    await userEvent.click(screen.getByRole("button", { name: "Disable" }));
    expect(calls.disable).toHaveBeenCalledWith("org-one", "bank-one");
  });
});
