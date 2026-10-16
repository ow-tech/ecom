import { AccountAudience } from "@prisma/client";
export type AuthenticatedUser = { id: string; email: string; displayName: string | null; accountAudience: AccountAudience };
export type RequestWithUser = { cookies?: Record<string, string>; user?: AuthenticatedUser; sessionId?: string };
