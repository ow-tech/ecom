import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  api: { changePassword: vi.fn(), requestPasswordReset: vi.fn(), resetPassword: vi.fn() },
  auth: { session: { id: "customer", email: "user@example.test" } as { id: string; email: string } | null, loading: false, refresh: vi.fn() },
  search: { get: vi.fn((key: string) => key === "token" ? "test-recovery-token-long-enough" : null) },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }), useSearchParams: () => mocks.search }));
vi.mock("../components/session-provider", () => ({ useSession: () => mocks.auth }));
vi.mock("../components/storefront-header", () => ({ StorefrontHeader: () => <header>Storefront</header> }));
vi.mock("../lib/api", () => ({ api: mocks.api }));

import SecurityPage from "../app/account/security/page";
import ForgotPasswordPage from "../app/(auth)/forgot-password/page";
import ResetPasswordPage from "../app/(auth)/reset-password/page";

beforeEach(() => {
  mocks.auth.session = { id: "customer", email: "user@example.test" };
  mocks.auth.refresh.mockResolvedValue(undefined);
  mocks.api.changePassword.mockResolvedValue({ status: "ok" });
  mocks.api.requestPasswordReset.mockResolvedValue({ status: "accepted" });
  mocks.api.resetPassword.mockResolvedValue({ status: "ok" });
  mocks.search.get.mockImplementation(key => key === "token" ? "test-recovery-token-long-enough" : null);
  vi.stubGlobal("history", { replaceState: vi.fn() });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe("account password security", () => {
  it("requires matching confirmation and uses the server-owned password change API", async () => {
    render(<SecurityPage />);
    await userEvent.type(screen.getByLabelText("Current password"), "OldVeryLongPassword34!");
    await userEvent.type(screen.getByLabelText("New password"), "NewVeryLongPassword54!");
    await userEvent.type(screen.getByLabelText("Confirm new password"), "SomethingElse123!");
    await userEvent.click(screen.getByRole("button", { name: /Change password and sign out/ }));
    expect(mocks.api.changePassword).not.toHaveBeenCalled();
    expect(screen.getByText("New passwords must match.")).toBeTruthy();
    await userEvent.clear(screen.getByLabelText("Confirm new password"));
    await userEvent.type(screen.getByLabelText("Confirm new password"), "NewVeryLongPassword54!");
    await userEvent.click(screen.getByRole("button", { name: /Change password and sign out/ }));
    await waitFor(() => expect(mocks.api.changePassword).toHaveBeenCalledWith("OldVeryLongPassword34!", "NewVeryLongPassword54!"));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/login"));
  });
  it("does not report a successful password change on server rejection", async () => {
    mocks.api.changePassword.mockRejectedValueOnce(new Error("Current password is incorrect"));
    render(<SecurityPage />);
    await userEvent.type(screen.getByLabelText("Current password"), "WrongLongPassword34!");
    await userEvent.type(screen.getByLabelText("New password"), "NewVeryLongPassword54!");
    await userEvent.type(screen.getByLabelText("Confirm new password"), "NewVeryLongPassword54!");
    await userEvent.click(screen.getByRole("button", { name: /Change password and sign out/ }));
    expect(await screen.findByText("Current password is incorrect")).toBeTruthy();
    expect(mocks.replace).not.toHaveBeenCalledWith("/login");
  });
  it("requests recovery without making account existence claims", async () => {
    render(<ForgotPasswordPage />);
    await userEvent.type(screen.getByLabelText("Email"), "user@example.test");
    await userEvent.click(screen.getByRole("button", { name: "Send recovery link" }));
    await waitFor(() => expect(mocks.api.requestPasswordReset).toHaveBeenCalledWith("user@example.test"));
    expect(screen.getByText(/If that address belongs to an account/)).toBeTruthy();
  });
  it("checks password confirmation before submitting reset token", async () => {
    window.location.hash = "#token=test-recovery-token-long-enough";
    render(<ResetPasswordPage />);
    await userEvent.type(screen.getByLabelText("New password"), "NewVeryLongPassword54!");
    await userEvent.type(screen.getByLabelText("Confirm password"), "DifferentPassword!56");
    await userEvent.click(screen.getByRole("button", { name: "Save new password" }));
    expect(mocks.api.resetPassword).not.toHaveBeenCalled();
    expect(screen.getByText("Passwords do not match.")).toBeTruthy();
    await userEvent.clear(screen.getByLabelText("Confirm password"));
    await userEvent.type(screen.getByLabelText("Confirm password"), "NewVeryLongPassword54!");
    await userEvent.click(screen.getByRole("button", { name: "Save new password" }));
    await waitFor(() => expect(mocks.api.resetPassword).toHaveBeenCalledWith("test-recovery-token-long-enough", "NewVeryLongPassword54!"));
    expect(await screen.findByText(/Password updated/)).toBeTruthy();
  });
});
