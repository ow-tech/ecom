import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const calls = vi.hoisted(() => ({
  list: vi.fn(), invites: vi.fn(), invite: vi.fn(), resend: vi.fn(), revoke: vi.fn(), changeRole: vi.fn(), remove: vi.fn(),
}));
vi.mock("../lib/api", () => ({ api: {
  organizationStaff: calls.list, supplierStaffInvitations: calls.invites, inviteOrganizationStaff: calls.invite,
  resendSupplierStaffInvitation: calls.resend, revokeSupplierStaffInvitation: calls.revoke,
  changeOrganizationStaffRole: calls.changeRole, removeOrganizationStaff: calls.remove,
} }));
import { SupplierStaffManagement } from "../components/supplier-staff-management";

const owner = { id: "owner-membership", status: "ACTIVE", roleKey: "organization.owner", createdAt: new Date().toISOString(), user: { id: "owner", email: "owner@example.test", displayName: "Supplier Owner" } };
const staff = { id: "staff-membership", status: "ACTIVE", roleKey: "organization.inventory_staff", createdAt: new Date().toISOString(), user: { id: "staff", email: "staff@example.test", displayName: "Inventory Agent" } };
const roles = [
  { key: "organization.admin", name: "Organization admin" },
  { key: "organization.member", name: "Organization member" },
  { key: "organization.inventory_staff", name: "Inventory staff" },
  { key: "organization.fulfilment_staff", name: "Fulfilment staff" },
  { key: "organization.finance_viewer", name: "Finance viewer" },
];
const management = ["organization.members.read", "organization.staff.manage"];

beforeEach(() => {
  calls.list.mockResolvedValue({ members: [owner, staff], roles });
  calls.invites.mockResolvedValue([]);
  calls.resend.mockResolvedValue({ delivery: "ACCEPTED_BY_PROVIDER" });
  calls.revoke.mockResolvedValue({ status: "REVOKED" });
  calls.invite.mockResolvedValue({ id: "new-invite", status: "PENDING", delivery: "ACCEPTED_BY_PROVIDER" });
  calls.changeRole.mockResolvedValue({ id: "staff-membership", roleKey: "organization.finance_viewer" });
  calls.remove.mockResolvedValue({ id: "staff-membership", status: "REMOVED" });
  vi.stubGlobal("confirm", vi.fn(() => true));
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe("supplier staff and permissions UI", () => {
  it("shows staff but blocks write controls for read-only users", async () => {
    render(<SupplierStaffManagement organizationId="org-a" actorUserId="someone" permissions={["organization.members.read"]}/>);
    expect(await screen.findByText("Inventory Agent")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Send invitation" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
    expect(calls.list).toHaveBeenCalledWith("org-a");
  });
  it("invites by email and a delegated role, never an owner role", async () => {
    render(<SupplierStaffManagement organizationId="org-a" actorUserId="owner" permissions={management}/>);
    await screen.findByText("Inventory Agent");
    await userEvent.type(screen.getByLabelText("Staff email"), "new@example.test");
    await userEvent.selectOptions(screen.getByLabelText("Staff role"), "organization.finance_viewer");
    await userEvent.click(screen.getByRole("button", { name: "Send invitation" }));
    await waitFor(() => expect(calls.invite).toHaveBeenCalledWith("org-a", { email: "new@example.test", roleKey: "organization.finance_viewer" }));
    expect(screen.queryByRole("option", { name: /owner/i })).toBeNull();
  });
  it("changes a staff role and revokes access, without offering owner removal", async () => {
    render(<SupplierStaffManagement organizationId="org-a" actorUserId="owner" permissions={management}/>);
    await screen.findByText("Inventory Agent");
    expect(screen.getAllByRole("button", { name: "Remove" })).toHaveLength(1);
    await userEvent.selectOptions(screen.getByLabelText("Role for staff@example.test"), "organization.finance_viewer");
    await userEvent.click(screen.getByRole("button", { name: "Update role" }));
    await waitFor(() => expect(calls.changeRole).toHaveBeenCalledWith("org-a", "staff-membership", "organization.finance_viewer"));
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(calls.remove).toHaveBeenCalledWith("org-a", "staff-membership"));
  });
  it("does not claim an invitation succeeded when its API fails", async () => {
    calls.invite.mockRejectedValueOnce(new Error("Registered account required"));
    render(<SupplierStaffManagement organizationId="org-a" actorUserId="owner" permissions={management}/>);
    await screen.findByText("Inventory Agent");
    await userEvent.type(screen.getByLabelText("Staff email"), "unknown@example.test");
    await userEvent.click(screen.getByRole("button", { name: "Send invitation" }));
    expect(await screen.findByText(/Registered account required/)).toBeTruthy();
    expect(screen.queryByText(/Invitation created/)).toBeNull();
  });
});
