import type { Session } from "./api";

const defaultDestination = "/";

/** Keeps post-auth navigation in this application and avoids auth-page loops. */
export function postAuthDestination(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value) || /%2f|%5c|%00/i.test(value)) return defaultDestination;
  if (value === "/login" || value.startsWith("/login?") || value === "/register" || value.startsWith("/register?") || value === "/staff/login" || value.startsWith("/staff/login?") || value === "/staff/register" || value.startsWith("/staff/register?")) return defaultDestination;
  return value;
}

export function loginHref(returnTo: string): string {
  const destination = postAuthDestination(returnTo);
  const isWorkforce = destination === "/supplier" || destination.startsWith("/supplier/") ||
    destination === "/platform" || destination.startsWith("/platform/");
  return `${isWorkforce ? "/staff/login" : "/login"}?returnTo=${encodeURIComponent(destination)}`;
}

/**
 * Post-auth routing is based on the fresh, server-owned /auth/me context,
 * NEVER on the login audience alone or on a user-controlled returnTo.
 * Platform takes precedence for hybrid accounts unless returnTo is authorized.
 */
const platformRoutePermissions: Record<string, readonly string[]> = {
  staff: ["platform.staff.read"],
  operations: ["platform.operations.read"],
  suppliers: ["platform.suppliers.read"],
  categories: ["platform.categories.read"],
  products: ["platform.products.read"],
  listings: ["platform.products.read"],
  orders: ["platform.orders.read"],
  delivery: ["platform.delivery.read"],
  payments: ["platform.payments.read"],
  finance: ["platform.finance.read"],
  aftersales: ["platform.refunds.read", "platform.returns.read", "platform.warranties.read"],
  support: ["platform.support.read"],
  audit: ["platform.audit.read"],
};
const supplierRoutePermissions: Record<string, readonly string[]> = {
  profile: ["supplier.read"],
  staff: ["organization.members.read"],
  listings: ["catalogue.listings.read"],
  inventory: ["inventory.read"],
  orders: ["orders.read"],
  fulfilment: ["orders.read"],
  finance: ["finance.read"],
  reports: ["supplier.read"],
  returns: ["returns.read"],
  warranties: ["warranties.read"],
  support: ["support.read"],
};

export const WORKFORCE_ACCESS_UNAVAILABLE = "/staff/access-unavailable";

export function workforceDestination(
  session: Pick<Session, "accountAudience" | "platformPermissions" | "organizations">,
  returnTo?: string | null,
): string {
  if (session.accountAudience !== "WORKFORCE") return WORKFORCE_ACCESS_UNAVAILABLE;
  const platform = session.platformPermissions;
  const organizations = session.organizations.filter(item => item.permissions.length > 0);
  const fallback = platform.length > 0 ? "/platform"
    : organizations[0] ? `/supplier/${encodeURIComponent(organizations[0].id)}`
    : WORKFORCE_ACCESS_UNAVAILABLE;

  const candidate = postAuthDestination(returnTo);
  if (candidate === "/") return fallback;
  const pathname = candidate.split(/[?#]/, 1)[0];
  const segments = pathname.split("/").filter(Boolean);

  if (segments[0] === "platform" && platform.length > 0) {
    if (segments.length === 1) return candidate;
    if (segments.length !== 2) return fallback;
    const required = platformRoutePermissions[segments[1]];
    return required?.some(value => platform.includes(value)) ? candidate : fallback;
  }

  if (segments[0] === "supplier") {
    if (segments.length === 1) return organizations[0] ? fallback === "/platform"
      ? `/supplier/${encodeURIComponent(organizations[0].id)}` : fallback : fallback;
    if (segments.length < 2 || segments.length > 3) return fallback;
    if (!/^[a-zA-Z0-9-]+$/.test(segments[1])) return fallback;
    const org = organizations.find(item => item.id === segments[1]);
    if (!org) return fallback;
    if (segments.length === 2) return org.permissions.includes("supplier.read") ? candidate : fallback;
    const required = supplierRoutePermissions[segments[2]];
    return required?.some(value => org.permissions.includes(value)) ? candidate : fallback;
  }
  return fallback;
}
