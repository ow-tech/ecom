import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  api: { customerAddresses: vi.fn(), createCustomerAddress: vi.fn(), updateCustomerAddress: vi.fn(), deleteCustomerAddress: vi.fn(), setDefaultCustomerAddress: vi.fn() },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("../components/session-provider", () => ({ useSession: () => ({ session: { id: "customer" }, loading: false }) }));
vi.mock("../components/storefront-header", () => ({ StorefrontHeader: () => <header>Storefront</header> }));
vi.mock("../lib/api", () => ({ api: mocks.api }));

import AddressesPage from "../app/account/addresses/page";

const home = { id: "home", label: "Home", recipientName: "Ada Customer", phone: "+254700000000", alternativePhone: null, countryCode: "KE", region: "Nairobi", city: "Nairobi", estate: "Westlands", street: "Main Road", building: null, houseNumber: null, landmark: null, deliveryNotes: "Call first", isDefault: true };
const office = { ...home, id: "office", label: "Office", phone: "+254700000001", estate: "Upper Hill", isDefault: false };

beforeEach(() => {
  mocks.api.customerAddresses.mockResolvedValue([home, office]);
  mocks.api.createCustomerAddress.mockImplementation(async input => ({ ...home, ...input, id: "new-address", isDefault: false }));
  mocks.api.updateCustomerAddress.mockImplementation(async (_id, input) => ({ ...office, ...input }));
  mocks.api.setDefaultCustomerAddress.mockResolvedValue({ ...office, isDefault: true });
  mocks.api.deleteCustomerAddress.mockResolvedValue({ deleted: true, defaultAddressId: home.id });
  vi.stubGlobal("confirm", vi.fn(() => true));
});

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe("customer address management", () => {
  it("adds, edits, sets default, and deletes through the owned customer API", async () => {
    render(<AddressesPage />);
    expect(await screen.findByText("Home")).toBeTruthy();
    expect(screen.getByText("Default")).toBeTruthy();

    await userEvent.click(screen.getAllByRole("button", { name: "Edit" })[1]);
    const city = screen.getByLabelText("City / town");
    await userEvent.clear(city);
    await userEvent.type(city, "Mombasa");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mocks.api.updateCustomerAddress).toHaveBeenCalledWith("office", expect.objectContaining({ city: "Mombasa" })));

    await userEvent.click(screen.getByRole("button", { name: "Set as default" }));
    await waitFor(() => expect(mocks.api.setDefaultCustomerAddress).toHaveBeenCalledWith("office"));
    await userEvent.click(screen.getAllByRole("button", { name: "Delete" })[1]);
    await waitFor(() => expect(mocks.api.deleteCustomerAddress).toHaveBeenCalledWith("office"));

    await userEvent.click(screen.getByRole("button", { name: "Add address" }));
    await userEvent.type(screen.getByLabelText("Recipient name"), "New Recipient");
    await userEvent.type(screen.getByLabelText("Phone number"), "+254722000000");
    await userEvent.type(screen.getByLabelText("County / region"), "Nakuru");
    await userEvent.type(screen.getByLabelText("City / town"), "Naivasha");
    await userEvent.click(screen.getByRole("button", { name: "Save address" }));
    await waitFor(() => expect(mocks.api.createCustomerAddress).toHaveBeenCalledWith(expect.objectContaining({ recipientName: "New Recipient", region: "Nakuru", city: "Naivasha" })));
  });
});
