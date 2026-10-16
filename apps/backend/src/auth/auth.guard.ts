import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { RequestWithUser } from "./auth.types";
@Injectable() export class SessionAuthGuard implements CanActivate { constructor(private readonly auth: AuthService) {} async canActivate(context: ExecutionContext): Promise<boolean> { const request = context.switchToHttp().getRequest<RequestWithUser>(); const result = await this.auth.authenticate(request.cookies?.[this.auth.cookieName()]); request.user = result.user; request.sessionId = result.sessionId; return true; } }
