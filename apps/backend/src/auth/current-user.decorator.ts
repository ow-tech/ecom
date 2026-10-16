import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { AuthenticatedUser, RequestWithUser } from "./auth.types";
export const CurrentUser = createParamDecorator((_: unknown, context: ExecutionContext): AuthenticatedUser => context.switchToHttp().getRequest<RequestWithUser>().user!);
