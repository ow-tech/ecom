import { Module } from "@nestjs/common";
import { TransactionalEmailModule } from "../notifications/transactional-email.module";
import { AuthController } from "./auth.controller"; import { AuthService } from "./auth.service"; import { SessionAuthGuard } from "./auth.guard";
@Module({ imports: [TransactionalEmailModule], controllers: [AuthController], providers: [AuthService, SessionAuthGuard], exports: [AuthService, SessionAuthGuard] }) export class AuthModule {}
