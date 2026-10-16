import { Module } from "@nestjs/common";
import { BrevoMailService } from "./brevo-mail.service";

// One provider binding across account recovery, staff invitations and notifications.
@Module({ providers: [BrevoMailService], exports: [BrevoMailService] })
export class TransactionalEmailModule {}
