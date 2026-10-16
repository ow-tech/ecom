import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  session: { session: { id: "customer", email: "customer@example.test" } as { id: string; email: string } | null, loading: false },
  api: {
    accountNotifications: vi.fn(), unreadNotificationCount: vi.fn(), markNotificationRead: vi.fn(),
    markAllNotificationsRead: vi.fn(), accountNotificationPreferences: vi.fn(), updateNotificationPreferences: vi.fn(),
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("../components/session-provider", () => ({ useSession: () => mocks.session }));
vi.mock("../components/storefront-header", () => ({ StorefrontHeader: () => <header>Storefront</header> }));
vi.mock("../lib/api", () => ({ api: mocks.api }));

import AccountNotificationsPage from "../app/account/notifications/page";
const notice = { id: "n-1", type: "ORDER_CREATED", category: "ORDER", title: "Order received", body: "Your order is saved.", entityType: "ORDER", entityId: "order-1", mandatory: false, readAt: null, createdAt: "2026-10-16T00:00:00Z" };
beforeEach(() => {
  mocks.session.session = { id: "customer", email: "customer@example.test" };
  mocks.api.accountNotifications.mockResolvedValue({ items: [notice], page: 1, limit: 20, total: 1 });
  mocks.api.unreadNotificationCount.mockResolvedValue({ count: 1 });
  mocks.api.accountNotificationPreferences.mockResolvedValue([{ category: "ORDER", inAppEnabled: true, emailEnabled: false, smsEnabled: false }]);
  mocks.api.markNotificationRead.mockResolvedValue({ id: notice.id, read: true });
  mocks.api.markAllNotificationsRead.mockResolvedValue({ count: 1 });
  mocks.api.updateNotificationPreferences.mockResolvedValue([]);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("customer notifications workspace", () => {
  it("loads owned notices and marks one read through the authenticated API", async () => {
    render(<AccountNotificationsPage />);
    expect(await screen.findByText("Order received")).toBeTruthy();
    expect(screen.getByText("1 unread notification")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Mark read" }));
    await waitFor(() => expect(mocks.api.markNotificationRead).toHaveBeenCalledWith("n-1"));
  });
  it("updates in-app preferences and never claims external email/SMS are configured", async () => {
    render(<AccountNotificationsPage />);
    await screen.findByText("Order received");
    await userEvent.click(screen.getByRole("checkbox", { name: "Order in-app notifications" }));
    await waitFor(() => expect(mocks.api.updateNotificationPreferences).toHaveBeenCalledWith([{ category: "ORDER", inAppEnabled: false }]));
    expect(screen.getByText(/Email and SMS delivery are not enabled yet/)).toBeTruthy();
  });
  it("shows failed mutations without announcing success", async () => {
    mocks.api.markAllNotificationsRead.mockRejectedValueOnce(new Error("Request unavailable"));
    render(<AccountNotificationsPage />);
    await screen.findByText("Order received");
    await userEvent.click(screen.getByRole("button", { name: "Mark all read" }));
    expect(await screen.findByText("Request unavailable")).toBeTruthy();
  });
  it("does not read notifications from an unauthenticated account", async () => {
    mocks.session.session = null;
    render(<AccountNotificationsPage />);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalled());
    expect(mocks.api.accountNotifications).not.toHaveBeenCalled();
  });
});
