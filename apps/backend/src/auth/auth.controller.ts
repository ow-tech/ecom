import { Body, Controller, Get, Post, Req, Res, UseGuards } from "@nestjs/common";
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { CurrentUser } from "./current-user.decorator";
import { SessionAuthGuard } from "./auth.guard";
import { AuthenticatedUser, RequestWithUser } from "./auth.types";
class RegisterDto { @IsEmail() email!: string; @IsString() @MinLength(12) @MaxLength(256) password!: string; @IsOptional() @IsString() @MaxLength(120) displayName?: string; }
class LoginDto { @IsEmail() email!: string; @IsString() password!: string; }
@Controller("auth") export class AuthController {
  constructor(private readonly auth: AuthService) {}
  private cookie(response: Response, token: string): void { response.cookie(this.auth.cookieName(), token, { httpOnly: true, sameSite: "lax", secure: this.auth.cookieSecure(), path: "/", maxAge: 1000 * 60 * 60 * 24 * 14 }); }
  @Post("register") async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) response: Response) { const { user, token } = await this.auth.register(dto.email, dto.password, dto.displayName); this.cookie(response, token); return { id: user.id, email: user.email, displayName: user.displayName, status: user.status }; }
  @Post("login") async login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: Response) { const { user, token } = await this.auth.login(dto.email, dto.password); this.cookie(response, token); return { id: user.id, email: user.email, displayName: user.displayName, status: user.status }; }
  @UseGuards(SessionAuthGuard) @Post("logout") async logout(@Req() request: Request & RequestWithUser, @Res({ passthrough: true }) response: Response) { await this.auth.logout(request.sessionId); response.clearCookie(this.auth.cookieName(), { httpOnly: true, sameSite: "lax", secure: this.auth.cookieSecure(), path: "/" }); return { status: "ok" }; }
  @UseGuards(SessionAuthGuard) @Get("me") async me(@CurrentUser() user: AuthenticatedUser) { return { ...user, ...(await this.auth.sessionContext(user.id)) }; }
}
