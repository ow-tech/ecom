import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  api: { platformRefundRequests: vi.fn(), platformReturns: vi.fn(), platformWarranties: vi.fn(),
    refundAction: vi.fn(), executePlatformRefund: vi.fn(), reconcilePlatformRefund: vi.fn(),
    returnAction: vi.fn(), warrantyAction: vi.fn() },
}));
vi.mock("../lib/api", () => ({ api: mocks.api }));
import { PlatformAfterSales } from "../components/platform-after-sales";
beforeEach(() => {
  mocks.api.platformRefundRequests.mockResolvedValue([]);
  mocks.api.platformReturns.mockResolvedValue([]);
  mocks.api.platformWarranties.mockResolvedValue([]);
  mocks.api.refundAction.mockResolvedValue({});
  mocks.api.executePlatformRefund.mockResolvedValue({});
  mocks.api.reconcilePlatformRefund.mockResolvedValue({});
  mocks.api.returnAction.mockResolvedValue({});
  mocks.api.warrantyAction.mockResolvedValue({});
  vi.stubGlobal("confirm", vi.fn(() => true));
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe("platform after-sales controls", () => {
  it("loads only authorized domains and transitions an inspecting return through its canonical API", async () => {
    mocks.api.platformReturns.mockResolvedValue([{ id: "return-a", status: "INSPECTING" }]);
    render(<PlatformAfterSales permissions={["platform.returns.read", "platform.returns.manage"]} />);
    expect(await screen.findByText("Returns")).toBeTruthy();
    expect(mocks.api.platformRefundRequests).not.toHaveBeenCalled();
    expect(mocks.api.platformWarranties).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Complete return" }));
    await userEvent.selectOptions(screen.getByLabelText("Return resolution"), "REPLACEMENT");
    await userEvent.click(screen.getByRole("button", { name: "Confirm completion" }));
    await waitFor(() => expect(mocks.api.returnAction).toHaveBeenCalledWith("return-a", "complete", expect.objectContaining({ resolution: "REPLACEMENT" })));
  });
  it("does not execute an approved refund without explicit confirmation", async () => {
    mocks.api.platformRefundRequests.mockResolvedValue([{ id: "request-a", status: "APPROVED", requestedAmount: "25.00", refund: { id: "refund-a", status: "CREATED", amount: "25.00" } }]);
    vi.stubGlobal("confirm", vi.fn(() => false));
    render(<PlatformAfterSales permissions={["platform.refunds.read", "platform.refunds.execute"]} />);
    await screen.findByText("Refund requests");
    await userEvent.click(screen.getByRole("button", { name: "Execute provider refund" }));
    expect(mocks.api.executePlatformRefund).not.toHaveBeenCalled();
    vi.stubGlobal("confirm", vi.fn(() => true));
    await userEvent.click(screen.getByRole("button", { name: "Execute provider refund" }));
    await waitFor(() => expect(mocks.api.executePlatformRefund).toHaveBeenCalledWith("refund-a"));
  });
  it("offers provider reconciliation but never re-executes an unknown refund", async () => {
    mocks.api.platformRefundRequests.mockResolvedValue([{ id: "request-a", status: "REFUND_PENDING", refund: { id: "refund-a", status: "UNKNOWN", amount: "25.00" } }]);
    render(<PlatformAfterSales permissions={["platform.refunds.read", "platform.refunds.reconcile", "platform.refunds.execute"]} />);
    expect(await screen.findByRole("button", { name: "Reconcile provider evidence" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Execute provider refund" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Reconcile provider evidence" }));
    await waitFor(() => expect(mocks.api.reconcilePlatformRefund).toHaveBeenCalledWith("refund-a"));
    expect(mocks.api.executePlatformRefund).not.toHaveBeenCalled();
  });
  it("resolves a service-stage warranty with the existing resolution contract", async () => {
    mocks.api.platformWarranties.mockResolvedValue([{ id: "warranty-a", status: "IN_SERVICE" }]);
    render(<PlatformAfterSales permissions={["platform.warranties.read", "platform.warranties.manage"]} />);
    expect(await screen.findByRole("button", { name: "Resolve warranty" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Resolve warranty" }));
    await userEvent.selectOptions(screen.getByLabelText("Warranty resolution"), "NO_FAULT_FOUND");
    await userEvent.click(screen.getByRole("button", { name: "Confirm resolution" }));
    await waitFor(() => expect(mocks.api.warrantyAction).toHaveBeenCalledWith("warranty-a", "resolve", expect.objectContaining({ resolution: "NO_FAULT_FOUND" })));
  });
  it("retains current state and shows an error if an action fails", async () => {
    mocks.api.platformReturns.mockResolvedValue([{ id: "return-a", status: "REQUESTED" }]);
    mocks.api.returnAction.mockRejectedValueOnce(new Error("Transition rejected"));
    render(<PlatformAfterSales permissions={["platform.returns.read", "platform.returns.manage"]} />);
    await screen.findByRole("button", { name: "Approve return" });
    await userEvent.click(screen.getByRole("button", { name: "Approve return" }));
    expect(await screen.findByText(/Transition rejected/)).toBeTruthy();
    expect(screen.queryByText(/Action completed/)).toBeNull();
  });
});
