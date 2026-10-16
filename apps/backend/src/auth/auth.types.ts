export type AuthenticatedUser = { id: string; email: string; displayName: string | null };
export type RequestWithUser = { cookies?: Record<string, string>; user?: AuthenticatedUser; sessionId?: string };
