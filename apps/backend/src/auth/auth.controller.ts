import { Body, Controller, Get, Post, Req, Res, UseGuards } from "@nestjs/common";
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { Request, Response } from "express";
import { AccountAudience } from "@prisma/client";
import { ForbiddenException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuthService } from "./auth.service";
import { CurrentUser } from "./current-user.decorator";
import { SessionAuthGuard } from "./auth.guard";
import { AuthenticatedUser, RequestWithUser } from "./auth.types";
class RegisterDto { @IsEmail() email!: string; @IsString() @MinLength(12) @MaxLength(256) password!: string; @IsOptional() @IsString() @MaxLength(120) displayName?: string; }
class ChangePasswordDto { @IsString() currentPassword!: string; @IsString() @MinLength(12) @MaxLength(256) newPassword!: string; }
class ResetRequestDto { @IsEmail() email!: string; }
class ResetPasswordDto { @IsString() @MinLength(32) @MaxLength(128) token!: string; @IsString() @MinLength(12) @MaxLength(256) newPassword!: string; }
class LoginDto { @IsEmail() email!: string; @IsString() password!: string; }
@Controller("auth") export class AuthController {
  constructor(private readonly auth: AuthService, private readonly config: ConfigService) {}
  private cookie(response: Response, token: string): void { response.cookie(this.auth.cookieName(), token, { httpOnly: true, sameSite: "lax", secure: this.auth.cookieSecure(), path: "/", maxAge: 1000 * 60 * 60 * 24 * 14 }); }
  @Post("register") async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) response: Response) { const { user, token } = await this.auth.register(dto.email, dto.password, dto.displayName, AccountAudience.CUSTOMER); this.cookie(response, token); return { id: user.id, email: user.email, displayName: user.displayName, status: user.status, accountAudience: user.accountAudience }; }
  // Temporary nonproduction onboarding seam until Phase 2 provides verified,
  // invitation-only workforce activation. Never expose staff signup in production.
  @Post("workforce/register") async registerWorkforce(@Body() dto: RegisterDto, @Res({ passthrough: true }) response: Response) {
    if (this.config.get<string>("NODE_ENV") === "production") throw new ForbiddenException("Workforce onboarding requires an invitation");
    const { user, token } = await this.auth.register(dto.email, dto.password, dto.displayName, AccountAudience.WORKFORCE);
    this.cookie(response, token);
    return { id: user.id, email: user.email, displayName: user.displayName, status: user.status, accountAudience: user.accountAudience };
  }
  @Post("login") async login(@Body() dto: LoginDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) { const { user, token } = await this.auth.login(dto.email, dto.password, request.ip, AccountAudience.CUSTOMER); this.cookie(response, token); return { id: user.id, email: user.email, displayName: user.displayName, status: user.status, accountAudience: user.accountAudience }; }
  @Post("workforce/login") async loginWorkforce(@Body() dto: LoginDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const { user, token } = await this.auth.login(dto.email, dto.password, request.ip, AccountAudience.WORKFORCE);
    this.cookie(response, token);
    return { id: user.id, email: user.email, displayName: user.displayName, status: user.status, accountAudience: user.accountAudience };
  }
  @Post("password/request-reset") requestReset(@Body() dto: ResetRequestDto, @Req() request: Request) { return this.auth.requestPasswordReset(dto.email, request.ip); }
  @Post("password/reset") reset(@Body() dto: ResetPasswordDto) { return this.auth.resetPassword(dto.token, dto.newPassword); }
  @UseGuards(SessionAuthGuard) @Post("password/change") async change(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePasswordDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.changePassword(user.id, dto.currentPassword, dto.newPassword);
    response.clearCookie(this.auth.cookieName(), { httpOnly: true, sameSite: "lax", secure: this.auth.cookieSecure(), path: "/" });
    return result;
  }
  @UseGuards(SessionAuthGuard) @Post("logout") async logout(@Req() request: Request & RequestWithUser, @Res({ passthrough: true }) response: Response) { await this.auth.logout(request.sessionId); response.clearCookie(this.auth.cookieName(), { httpOnly: true, sameSite: "lax", secure: this.auth.cookieSecure(), path: "/" }); return { status: "ok" }; }
  @UseGuards(SessionAuthGuard) @Get("me") async me(@CurrentUser() user: AuthenticatedUser) { return { ...user, ...(await this.auth.sessionContext(user.id)) }; }
}
