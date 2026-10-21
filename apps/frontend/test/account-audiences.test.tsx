import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  push: vi.fn(), refresh: vi.fn(), returnTo: null as string | null,
  register: vi.fn(), login: vi.fn(), workforceRegister: vi.fn(), workforceLogin: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.push }),
  useSearchParams: () => ({ get: (key: string) => key === "returnTo" ? mocks.returnTo : null }),
}));
vi.mock("../lib/api", () => ({ api: {
  register: mocks.register, login: mocks.login,
  workforceRegister: mocks.workforceRegister, workforceLogin: mocks.workforceLogin,
}, ApiError: class ApiError extends Error {} }));
vi.mock("../components/session-provider", () => ({ useSession: () => ({ refresh: mocks.refresh }) }));
import { AuthForm } from "../components/auth-form";

const customerSession = { id: "customer", accountAudience: "CUSTOMER", organizations: [], platformPermissions: [] };
const platformSession = { id: "platform", accountAudience: "WORKFORCE", organizations: [], platformPermissions: ["platform.operations.read", "platform.orders.read"] };
const supplierSession = { id: "supplier", accountAudience: "WORKFORCE", organizations: [{ id: "org-1", name: "Supplier", slug: "supplier", permissions: ["supplier.read", "orders.read", "inventory.read"] }], platformPermissions: [] };
const hybridSession = { id: "hybrid", accountAudience: "WORKFORCE", organizations: supplierSession.organizations, platformPermissions: platformSession.platformPermissions };

beforeEach(() => {
  for (const method of [mocks.register, mocks.login, mocks.workforceRegister, mocks.workforceLogin]) method.mockResolvedValue({});
  mocks.refresh.mockResolvedValue(customerSession);
  mocks.returnTo = null;
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

async function enterCredentials() {
  await userEvent.type(screen.getByLabelText("Email"), "person@example.test");
  await userEvent.type(screen.getByLabelText("Password"), "LongEnoughPassword!9");
}
describe("exclusive customer and workforce UI sign-in flows", () => {
  it("sends platform-only admins directly to platform, without fake supplier membership", async () => {
    mocks.refresh.mockResolvedValue(platformSession);
    render(<AuthForm mode="login" audience="WORKFORCE" />);
    await enterCredentials();
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(mocks.workforceLogin).toHaveBeenCalledWith("person@example.test", "LongEnoughPassword!9"));
    expect(mocks.login).not.toHaveBeenCalled();
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/platform"));
  });
  it("routes supplier-only staff to their real organization workspace", async () => {
    mocks.refresh.mockResolvedValue(supplierSession);
    render(<AuthForm mode="login" audience="WORKFORCE" />);
    await enterCredentials();
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/supplier/org-1"));
  });
  it("honors a hybrid user's authorized supplier return path and its query", async () => {
    mocks.refresh.mockResolvedValue(hybridSession);
    mocks.returnTo = "/supplier/org-1/inventory?view=ATTENTION";
    render(<AuthForm mode="login" audience="WORKFORCE" />);
    await enterCredentials();
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/supplier/org-1/inventory?view=ATTENTION"));
  });
  it("honors an authorized platform returnTo for hybrid staff", async () => {
    mocks.refresh.mockResolvedValue(hybridSession);
    mocks.returnTo = "/platform/orders?status=PAYMENT_REVIEW";
    render(<AuthForm mode="login" audience="WORKFORCE" />);
    await enterCredentials();
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/platform/orders?status=PAYMENT_REVIEW"));
  });
  it("rejects supplier returnTo for platform-only staff and defaults to platform", async () => {
    mocks.refresh.mockResolvedValue(platformSession);
    mocks.returnTo = "/supplier/org-1";
    render(<AuthForm mode="login" audience="WORKFORCE" />);
    await enterCredentials();
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/platform"));
  });
  it("rejects unauthorized platform pages for limited platform staff", async () => {
    mocks.refresh.mockResolvedValue(platformSession);
    mocks.returnTo = "/platform/finance";
    render(<AuthForm mode="login" audience="WORKFORCE" />);
    await enterCredentials();
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/platform"));
  });
  it("fails closed on outside-origin and protocol-relative return paths", async () => {
    mocks.refresh.mockResolvedValue(platformSession);
    mocks.returnTo = "//attacker.example";
    const view = render(<AuthForm mode="login" audience="WORKFORCE" />);
    await enterCredentials();
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/platform"));
    view.unmount();
    mocks.push.mockClear();
    mocks.returnTo = "https://attacker.example";
    render(<AuthForm mode="login" audience="WORKFORCE" />);
    await enterCredentials();
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/platform"));
  });
  it("sends workforce accounts with no entitlement to an honest unavailable page", async () => {
    mocks.refresh.mockResolvedValue({ id: "no-roles", accountAudience: "WORKFORCE", organizations: [], platformPermissions: [] });
    render(<AuthForm mode="login" audience="WORKFORCE" />);
    await enterCredentials();
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/staff/access-unavailable"));
  });
  it("does not navigate when the post-login session cannot be verified", async () => {
    mocks.refresh.mockResolvedValue(null);
    render(<AuthForm mode="login" audience="WORKFORCE" />);
    await enterCredentials();
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText(/account context could not be verified/i)).toBeTruthy();
    expect(mocks.push).not.toHaveBeenCalled();
  });
  it("keeps customer login on the customer endpoint", async () => {
    render(<AuthForm mode="login" />);
    await enterCredentials();
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(mocks.login).toHaveBeenCalledWith("person@example.test", "LongEnoughPassword!9"));
    expect(mocks.workforceLogin).not.toHaveBeenCalled();
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/"));
  });
  it("keeps customer signup separate from nonproduction workforce signup", async () => {
    const view = render(<AuthForm mode="register" />);
    await enterCredentials();
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(mocks.register).toHaveBeenCalled());
    expect(mocks.workforceRegister).not.toHaveBeenCalled();
    view.unmount();
    mocks.refresh.mockResolvedValue(supplierSession);
    render(<AuthForm mode="register" audience="WORKFORCE" />);
    await enterCredentials();
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(mocks.workforceRegister).toHaveBeenCalled());
  });
  it("does not navigate on a rejected workforce login", async () => {
    mocks.workforceLogin.mockRejectedValueOnce(new Error("Rejected"));
    render(<AuthForm mode="login" audience="WORKFORCE" />);
    await enterCredentials();
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText(/could not reach the service/i)).toBeTruthy();
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
