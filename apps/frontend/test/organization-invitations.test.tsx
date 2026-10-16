import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(), refresh: vi.fn(),
  state: { session: { id: "member", email: "member@example.test" } as { id: string; email: string } | null, loading: false },
  api: { organizationInvitations: vi.fn(), acceptOrganizationInvitation: vi.fn() },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("../components/session-provider", () => ({ useSession: () => ({ ...mocks.state, refresh: mocks.refresh }) }));
vi.mock("../components/storefront-header", () => ({ StorefrontHeader: () => <header>Storefront</header> }));
vi.mock("../lib/api", () => ({ api: mocks.api }));
import OrganizationInvitationsPage from "../app/account/invitations/page";

const invitation = { id: "invite-1", organizationId: "org-a", organizationName: "Supplier A", roleKey: "organization.inventory_staff" };
beforeEach(() => {
  mocks.state.session = { id: "member", email: "member@example.test" };
  mocks.api.organizationInvitations.mockResolvedValue([invitation]);
  mocks.api.acceptOrganizationInvitation.mockResolvedValue({ status: "ACTIVE", organizationId: "org-a" });
  mocks.refresh.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("member invitation acceptance", () => {
  it("accepts an owned invitation and refreshes organization permissions", async () => {
    mocks.api.organizationInvitations.mockResolvedValueOnce([invitation]).mockResolvedValueOnce([]);
    render(<OrganizationInvitationsPage />);
    expect(await screen.findByText("Supplier A")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Accept invitation" }));
    await waitFor(() => expect(mocks.api.acceptOrganizationInvitation).toHaveBeenCalledWith("invite-1"));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(await screen.findByText("No pending invitations")).toBeTruthy();
  });
  it("does not hide pending invitations or claim success on failure", async () => {
    mocks.api.acceptOrganizationInvitation.mockRejectedValueOnce(new Error("Invitation expired"));
    render(<OrganizationInvitationsPage />);
    await screen.findByText("Supplier A");
    await userEvent.click(screen.getByRole("button", { name: "Accept invitation" }));
    expect(await screen.findByText(/Invitation expired/)).toBeTruthy();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("redirects a signed-out user without reading their invitations", async () => {
    mocks.state.session = null;
    render(<OrganizationInvitationsPage />);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalled());
    expect(mocks.api.organizationInvitations).not.toHaveBeenCalled();
  });
});
