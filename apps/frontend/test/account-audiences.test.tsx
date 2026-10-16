import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  push: vi.fn(), refresh: vi.fn(),
  register: vi.fn(), login: vi.fn(), workforceRegister: vi.fn(), workforceLogin: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.push }),
  useSearchParams: () => ({ get: () => null }),
}));
vi.mock("../lib/api", () => ({ api: {
  register: mocks.register, login: mocks.login,
  workforceRegister: mocks.workforceRegister, workforceLogin: mocks.workforceLogin,
}, ApiError: class ApiError extends Error {} }));
vi.mock("../components/session-provider", () => ({ useSession: () => ({ refresh: mocks.refresh }) }));
import { AuthForm } from "../components/auth-form";

beforeEach(() => {
  for (const method of [mocks.register, mocks.login, mocks.workforceRegister, mocks.workforceLogin, mocks.refresh]) method.mockResolvedValue({});
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

async function enterCredentials() {
  await userEvent.type(screen.getByLabelText("Email"), "person@example.test");
  await userEvent.type(screen.getByLabelText("Password"), "LongEnoughPassword!9");
}
describe("exclusive customer and workforce UI sign-in flows", () => {
  it("sends workforce sign-in only to the workforce API and workspace", async () => {
    render(<AuthForm mode="login" audience="WORKFORCE" />);
    await enterCredentials();
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(mocks.workforceLogin).toHaveBeenCalledWith("person@example.test", "LongEnoughPassword!9"));
    expect(mocks.login).not.toHaveBeenCalled();
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/supplier"));
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
