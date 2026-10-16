import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  state: { session: { id: "customer", email: "customer@example.test" } as { id: string; email: string } | null, loading: false },
  api: { customerProfile: vi.fn(), updateCustomerProfile: vi.fn() },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("../components/session-provider", () => ({ useSession: () => mocks.state }));
vi.mock("../components/storefront-header", () => ({ StorefrontHeader: () => <header>Storefront</header> }));
vi.mock("../lib/api", () => ({ api: mocks.api }));

import ProfilePage from "../app/account/profile/page";

const existing = { id: "profile-1", userId: "customer", firstName: "Amina", lastName: "Juma", phone: "0700000000", alternativePhone: null };

beforeEach(() => {
  mocks.state.session = { id: "customer", email: "customer@example.test" };
  mocks.api.customerProfile.mockResolvedValue(existing);
  mocks.api.updateCustomerProfile.mockImplementation(async (input: Record<string, string>) => ({ ...existing, ...input }));
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("owned customer profile UI", () => {
  it("loads the backend profile and persists edited contact fields", async () => {
    render(<ProfilePage />);
    expect(await screen.findByDisplayValue("Amina")).toBeTruthy();
    expect(screen.getByText(/Account email: customer@example.test/)).toBeTruthy();
    await userEvent.clear(screen.getByLabelText("First name"));
    await userEvent.type(screen.getByLabelText("First name"), "Marta");
    await userEvent.clear(screen.getByLabelText("Phone number"));
    await userEvent.type(screen.getByLabelText("Phone number"), "+254712345678");
    await userEvent.click(screen.getByRole("button", { name: "Save profile" }));
    await waitFor(() => expect(mocks.api.updateCustomerProfile).toHaveBeenCalledWith(expect.objectContaining({
      firstName: "Marta", phone: "+254712345678",
    })));
    expect(await screen.findByText("Your profile was updated.")).toBeTruthy();
  });

  it("does not claim success when the backend update rejects", async () => {
    mocks.api.updateCustomerProfile.mockRejectedValueOnce(new Error("Please try again"));
    render(<ProfilePage />);
    await screen.findByDisplayValue("Amina");
    await userEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect(await screen.findByText(/Please try again/)).toBeTruthy();
    expect(screen.queryByText("Your profile was updated.")).toBeNull();
  });

  it("redirects signed-out users without requesting profile information", async () => {
    mocks.state.session = null;
    render(<ProfilePage />);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalled());
    expect(mocks.api.customerProfile).not.toHaveBeenCalled();
  });
});
