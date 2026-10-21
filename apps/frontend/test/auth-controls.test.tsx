import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const mocks = vi.hoisted(() => ({
  replace: vi.fn(), refresh: vi.fn(), signOut: vi.fn(),
  audience: "CUSTOMER" as "CUSTOMER" | "WORKFORCE",
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }) }));
vi.mock("../components/session-provider", () => ({
  useSession: () => ({ session: { accountAudience: mocks.audience }, signOut: mocks.signOut }),
}));
import { PasswordInput } from "../components/password-input";
import { SignOutButton } from "../components/sign-out-button";
afterEach(() => { cleanup(); vi.clearAllMocks(); window.sessionStorage.clear(); mocks.audience = "CUSTOMER"; });
describe("account sign-out and password input", () => {
  it("reveals a password only in the local field, preserving its value", async () => {
    render(<div><label htmlFor="secret">Password</label><PasswordInput id="secret" autoComplete="current-password" /></div>);
    const field = screen.getByLabelText("Password") as HTMLInputElement;
    await userEvent.type(field, "Secret123456!");
    expect(field.type).toBe("password");
    await userEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(field.type).toBe("text");
    expect(field.value).toBe("Secret123456!");
    await userEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(field.type).toBe("password");
  });
  it("revokes the server session, clears checkout intent and returns to customer login", async () => {
    mocks.signOut.mockResolvedValue(undefined);
    window.sessionStorage.setItem("ecom.checkout.payment-intent", "saved");
    render(<SignOutButton />);
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledTimes(1));
    expect(window.sessionStorage.getItem("ecom.checkout.payment-intent")).toBeNull();
    expect(mocks.replace).toHaveBeenCalledWith("/login");
  });
  it("uses staff login when signing out a workforce account", async () => {
    mocks.audience = "WORKFORCE";
    mocks.signOut.mockResolvedValue(undefined);
    render(<SignOutButton />);
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/staff/login"));
  });
  it("keeps the checkout intent if server session revocation fails", async () => {
    mocks.signOut.mockRejectedValueOnce(new Error("Server unreachable"));
    window.sessionStorage.setItem("ecom.checkout.payment-intent", "saved");
    render(<SignOutButton />);
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(window.sessionStorage.getItem("ecom.checkout.payment-intent")).toBe("saved");
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
