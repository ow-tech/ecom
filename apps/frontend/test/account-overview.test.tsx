import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  session: { id: "customer-1", email: "amina@example.test", displayName: null, accountAudience: "CUSTOMER", organizations: [], platformPermissions: [] } as {
    id: string; email: string; displayName: string | null; accountAudience: "CUSTOMER" | "WORKFORCE";
    organizations: Array<{ id: string; name: string; permissions: string[] }>; platformPermissions: string[];
  },
  profile: vi.fn(), addresses: vi.fn(), replace: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("../components/session-provider", () => ({ useSession: () => ({ session: mocks.session, loading: false }) }));
vi.mock("../lib/api", () => ({ api: { customerProfile: mocks.profile, customerAddresses: mocks.addresses } }));
import AccountPage from "../app/account/page";

beforeEach(() => {
  mocks.session = { id: "customer-1", email: "amina@example.test", displayName: null, accountAudience: "CUSTOMER", organizations: [], platformPermissions: [] };
  mocks.profile.mockResolvedValue({ id: "profile-1", userId: "customer-1", firstName: "Amina", lastName: "Juma", phone: "+254700123456", alternativePhone: null });
  mocks.addresses.mockResolvedValue([{ id: "address-1", label: "Home", recipientName: "Amina Juma", city: "Nairobi", region: "Nairobi", isDefault: true }]);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("saved account information overview", () => {
  it("shows owned persisted personal and default delivery data", async () => {
    render(<AccountPage />);
    expect(await screen.findByText("Amina Juma")).toBeTruthy();
    expect(screen.getByText("+254700123456")).toBeTruthy();
    expect(screen.getByText("amina@example.test")).toBeTruthy();
    expect(screen.getByText(/Home — Nairobi, Nairobi/)).toBeTruthy();
    expect(mocks.profile).toHaveBeenCalledOnce();
    expect(mocks.addresses).toHaveBeenCalledOnce();
  });
  it("does not call customer-only APIs for a workforce session", async () => {
    mocks.session = { id: "workforce-1", email: "worker@example.test", displayName: "Worker", accountAudience: "WORKFORCE", organizations: [], platformPermissions: [] };
    render(<AccountPage />);
    expect(screen.queryByText("Your saved details")).toBeNull();
    await waitFor(() => { expect(mocks.profile).not.toHaveBeenCalled(); expect(mocks.addresses).not.toHaveBeenCalled(); });
  });
  it("displays a fetch failure instead of claiming empty saved data", async () => {
    mocks.profile.mockRejectedValueOnce(new Error("Account temporarily unavailable"));
    render(<AccountPage />);
    expect((await screen.findByRole("alert")).textContent).toContain("Account temporarily unavailable");
  });
});
