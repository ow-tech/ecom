import { Injectable, Logger } from "@nestjs/common";
import { OperationalOutboxStatus, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationDeliveryService } from "../notifications/notification-delivery.service";

type Claimed = { id: string; eventType: string; payload: Prisma.JsonValue; attemptCount: number };
@Injectable()
export class OperationalOutboxProcessor {
  private readonly logger = new Logger(OperationalOutboxProcessor.name);
  constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationDeliveryService) {}
  private maxAttempts() { return Number(process.env.OUTBOX_MAX_ATTEMPTS ?? 8); }
  async processBatch(workerId = `operations-${randomUUID()}`, batchSize = Number(process.env.OUTBOX_BATCH_SIZE ?? 25)) {
    const claimed = await this.prisma.$queryRaw<Claimed[]>(Prisma.sql`WITH picked AS (SELECT "id" FROM "OperationalOutboxEvent" WHERE "status" = 'PENDING' AND "availableAt" <= NOW() ORDER BY "availableAt", "createdAt" FOR UPDATE SKIP LOCKED LIMIT ${batchSize}) UPDATE "OperationalOutboxEvent" e SET "status" = 'PROCESSING', "claimedAt" = NOW(), "claimedBy" = ${workerId}, "attemptCount" = e."attemptCount" + 1, "updatedAt" = NOW() FROM picked WHERE e."id" = picked."id" RETURNING e."id", e."eventType", e."payload", e."attemptCount"`);
    for (const event of claimed) await this.processOne(event);
    return { claimed: claimed.length };
  }
  private async processOne(event: Claimed) {
    try {
      await this.notifications.handleOutboxEvent(event.eventType, event.payload);
      await this.prisma.operationalOutboxEvent.update({ where: { id: event.id }, data: { status: OperationalOutboxStatus.PROCESSED, processedAt: new Date(), claimedAt: null, claimedBy: null, lastErrorCode: null, lastErrorMessage: null } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Operational event handler failed";
      const terminal = event.attemptCount >= this.maxAttempts();
      const delay = Math.min(60 * 60, 2 ** Math.min(event.attemptCount, 10));
      await this.prisma.operationalOutboxEvent.update({ where: { id: event.id }, data: terminal ? { status: OperationalOutboxStatus.FAILED, lastErrorCode: "HANDLER_FAILED", lastErrorMessage: message, claimedAt: null, claimedBy: null } : { status: OperationalOutboxStatus.PENDING, availableAt: new Date(Date.now() + delay * 1000), lastErrorCode: "HANDLER_FAILED", lastErrorMessage: message, claimedAt: null, claimedBy: null } });
      this.logger.warn(`outboxEventId=${event.id} processing failed: ${message}`);
    }
  }
}
