import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const calls = vi.hoisted(() => ({ platformAudit: vi.fn() }));
vi.mock("../lib/api", () => ({ api: calls }));
import { PlatformAuditExplorer } from "../components/platform-audit-explorer";
const row = { id: "audit-one", actorUserId: "actor-001", actorType: "USER", action: "PRODUCT_UPDATED",
  entityType: "PRODUCT", entityId: "product-001", createdAt: "2026-10-16T10:00:00Z", metadata: { changedFields: ["status"] } };
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("platform audit explorer", () => {
  it("loads server audit entries and supports filtering", async () => {
    calls.platformAudit.mockResolvedValue({ items: [row], total: 1, page: 1, limit: 25 });
    render(<PlatformAuditExplorer />);
    expect(await screen.findByText("PRODUCT_UPDATED")).toBeTruthy();
    await userEvent.type(screen.getByLabelText("Action"), "PRODUCT_UPDATED");
    await userEvent.type(screen.getByLabelText("Entity type"), "PRODUCT");
    await userEvent.click(screen.getByRole("button", { name: "Filter audit" }));
    await waitFor(() => expect(calls.platformAudit).toHaveBeenLastCalledWith({ action: "PRODUCT_UPDATED", entityType: "PRODUCT", actor: "", page: 1, limit: 25 }));
  });
  it("paginates via canonical server queries rather than loading an unbounded history", async () => {
    calls.platformAudit.mockImplementation(async input => ({ items: [row], total: 28, page: input.page, limit: 25 }));
    render(<PlatformAuditExplorer />);
    await screen.findByText("PRODUCT_UPDATED");
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(calls.platformAudit).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, limit: 25 })));
  });
  it("shows recoverable errors without leaking previous event rows", async () => {
    calls.platformAudit.mockRejectedValueOnce(new Error("Audit access denied")).mockResolvedValue({ items: [], total: 0, page: 1, limit: 25 });
    render(<PlatformAuditExplorer />);
    expect(await screen.findByText(/Audit access denied/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No audit events")).toBeTruthy();
  });
});
