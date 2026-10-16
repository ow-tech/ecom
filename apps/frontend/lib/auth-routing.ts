const defaultDestination = "/";

/** Keeps post-auth navigation in this application and avoids auth-page loops. */
export function postAuthDestination(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return defaultDestination;
  if (value === "/login" || value.startsWith("/login?") || value === "/register" || value.startsWith("/register?")) return defaultDestination;
  return value;
}

export function loginHref(returnTo: string): string {
  return `/login?returnTo=${encodeURIComponent(postAuthDestination(returnTo))}`;
}
