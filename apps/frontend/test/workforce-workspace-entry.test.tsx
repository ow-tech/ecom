import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), pathname: "/platform",
  session: null as null | { id: string; email: string; displayName: string | null; accountAudience: "WORKFORCE";
    organizations: Array<{ id: string; name: string; permissions: string[] }>; platformPermissions: string[] },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, push: mocks.push, refresh: mocks.refresh }),
  usePathname: () => mocks.pathname,
}));
vi.mock("../components/session-provider", () => ({ useSession: () => ({ session: mocks.session, loading: false, signOut: vi.fn() }) }));
import SupplierEntryPage from "../app/supplier/page";
import { WorkspaceShell } from "../components/workspace-shell";

const platformOnly = {
  id: "admin", email: "admin@example.test", displayName: "Administrator",
  accountAudience: "WORKFORCE" as const, organizations: [], platformPermissions: ["platform.operations.read"],
};
const supplierOnly = {
  ...platformOnly, id: "supplier", organizations: [{ id: "org-1", name: "Supplier A", permissions: ["supplier.read"] }],
  platformPermissions: [],
};
afterEach(() => { cleanup(); vi.clearAllMocks(); mocks.session = null; mocks.pathname = "/platform"; });

describe("workspace entry and platform-only access", () => {
  it("redirects a platform-only administrator away from /supplier to /platform", async () => {
    mocks.session = platformOnly;
    render(<SupplierEntryPage />);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/platform"));
  });
  it("redirects supplier-only staff to the entitled organization", async () => {
    mocks.session = supplierOnly;
    render(<SupplierEntryPage />);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/supplier/org-1"));
  });
  it("does not claim a supplier membership exists when no workspace is assigned", async () => {
    mocks.session = { ...platformOnly, id: "no-access", platformPermissions: [] };
    render(<SupplierEntryPage />);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/staff/access-unavailable"));
  });
  it("renders /platform for a platform-only account with zero organizations", () => {
    mocks.session = platformOnly;
    mocks.pathname = "/platform";
    render(<WorkspaceShell surface="platform" title="Platform admin"
      nav={[{ href: "/platform", label: "Overview", permission: "platform.operations.read" }]}>
      <p>Authorized platform dashboard</p>
    </WorkspaceShell>);
    expect(screen.getByText("Authorized platform dashboard")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Platform admin navigation" })).toBeTruthy();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(screen.queryByText(/Workspace unavailable/)).toBeNull();
  });
});
