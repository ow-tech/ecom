const defaultDestination = "/";

/** Keeps post-auth navigation in this application and avoids auth-page loops. */
export function postAuthDestination(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return defaultDestination;
  if (value === "/login" || value.startsWith("/login?") || value === "/register" || value.startsWith("/register?") || value === "/staff/login" || value.startsWith("/staff/login?") || value === "/staff/register" || value.startsWith("/staff/register?")) return defaultDestination;
  return value;
}

export function loginHref(returnTo: string): string {
  const destination = postAuthDestination(returnTo);
  const isWorkforce = destination === "/supplier" || destination.startsWith("/supplier/") ||
    destination === "/platform" || destination.startsWith("/platform/");
  return `${isWorkforce ? "/staff/login" : "/login"}?returnTo=${encodeURIComponent(destination)}`;
}
