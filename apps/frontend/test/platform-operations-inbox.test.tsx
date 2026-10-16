import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const api = vi.hoisted(() => ({ platformOutboxPage: vi.fn() }));
vi.mock("../lib/api", () => ({ api }));
import { PlatformOperationsInbox } from "../components/platform-operations-inbox";

const failed = { id: "event-failed", eventType: "PAYMENT_CONFIRMED", aggregateType: "Payment", aggregateId: "id", status: "FAILED", attemptCount: 8, lastErrorCode: "CLAIM_LEASE_EXPIRED", claimedAt: null, availableAt: "2026-10-16T00:00:00Z", createdAt: "2026-10-16T00:00:00Z" };
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("platform background operations triage", () => {
  it("only requests a sanitized projection with failed jobs as the default", async () => {
    api.platformOutboxPage.mockResolvedValue({ items: [failed], total: 1, page: 1, limit: 25 });
    render(<PlatformOperationsInbox />);
    expect(await screen.findByText("CLAIM_LEASE_EXPIRED")).toBeTruthy();
    expect(api.platformOutboxPage).toHaveBeenCalledWith({ status: "FAILED", page: 1, limit: 25 });
    expect(screen.queryByRole("button", { name: /Retry job/i })).toBeNull();
  });
  it("ignores stale results after status changes", async () => {
    let finish!: (value: any) => void;
    const older = new Promise<any>(resolve => { finish = resolve; });
    api.platformOutboxPage.mockImplementation(({ status }: { status?: string }) => status === "FAILED" ? older :
      Promise.resolve({ items: [{ ...failed, id: "processing-event", status: "PROCESSING", lastErrorCode: null }], total: 1, page: 1, limit: 25 }));
    render(<PlatformOperationsInbox />);
    await waitFor(() => expect(api.platformOutboxPage).toHaveBeenCalledTimes(1));
    await userEvent.selectOptions(screen.getByLabelText("Processing status"), "PROCESSING");
    expect(await screen.findByText("PROCESSING")).toBeTruthy();
    finish({ items: [failed], total: 1, page: 1, limit: 25 });
    await waitFor(() => expect(api.platformOutboxPage).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("CLAIM_LEASE_EXPIRED")).toBeNull();
  });
  it("surfaces backend failures and retries on refresh", async () => {
    api.platformOutboxPage.mockRejectedValueOnce(new Error("Unavailable")).mockResolvedValueOnce({ items: [], total: 0, page: 1, limit: 25 });
    render(<PlatformOperationsInbox />);
    expect(await screen.findByText(/Unavailable/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No matching background jobs")).toBeTruthy();
  });
});
