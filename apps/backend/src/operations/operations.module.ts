import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { RbacModule } from "../rbac/rbac.module";
import { OperationsOutboxController } from "./operations.controller";
import { OperationalOutboxProcessor } from "./outbox.processor";
import { OperationalOutboxService } from "./operations.service";
@Module({ imports: [AuthModule, RbacModule, NotificationsModule], controllers: [OperationsOutboxController], providers: [OperationalOutboxService, OperationalOutboxProcessor], exports: [OperationalOutboxService, OperationalOutboxProcessor] }) export class OperationsModule {}
